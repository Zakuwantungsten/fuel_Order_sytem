# Fuel Order Management System — Frontend Documentation

**Version:** 0.1.0  
**Last Updated:** February 21, 2026  
**Framework:** React 18 + TypeScript + Vite  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Getting Started](#5-getting-started)
6. [Authentication & Session Management](#6-authentication--session-management)
7. [Role-Based Access Control (RBAC)](#7-role-based-access-control-rbac)
8. [Routing](#8-routing)
9. [State Management](#9-state-management)
10. [Data Models (Types)](#10-data-models-types)
11. [Pages](#11-pages)
12. [Components](#12-components)
13. [Services & API Layer](#13-services--api-layer)
14. [Hooks](#14-hooks)
15. [Contexts](#15-contexts)
16. [Utilities](#16-utilities)
17. [Styling](#17-styling)
18. [Configuration Files](#18-configuration-files)
19. [Testing](#19-testing)
20. [Build & Deployment](#20-build--deployment)

---

## 1. Overview

The Fuel Order Management System frontend is a React + TypeScript single-page application (SPA) built with Vite. It provides a comprehensive dashboard for managing every aspect of fuel logistics operations, including:

- **Delivery Orders (DOs)** – Create, track, and manage import/export delivery orders.
- **Local Purchase Orders (LPOs)** – Generate and forward fuel purchase orders across stations.
- **Fuel Records** – Track fuel dispensed at each checkpoint along a journey route.
- **Yard Fuel Dispensing** – Record and monitor fuel dispensed at MMSA, Tanga, and Dar yards.
- **Fleet Tracking** – Monitor truck journeys with queue and active/completed status.
- **Reporting & Analytics** – Revenue, fuel consumption, and operational reports with charts.
- **User Management** – Role-based access control with 19 distinct roles.
- **System Administration** – Audit logs, database monitoring, backup/recovery, and configuration.

The application supports both **light and dark themes**, per-user theme persistence, and auto-logout on inactivity (30 minutes).

---

## 2. Technology Stack

| Category | Library / Tool | Version |
|---|---|---|
| UI Framework | React | 18.2.0 |
| Language | TypeScript | 5.2.2 |
| Build Tool | Vite | 5.0.8 |
| Routing | React Router DOM | 6.20.0 |
| Server State | TanStack React Query | 5.90.12 |
| HTTP Client | Axios | 1.6.2 |
| Styling | Tailwind CSS | 3.3.6 |
| Icons | Lucide React | 0.294.0 |
| Charts | Recharts | 3.6.0 |
| Maps | React Leaflet | 4.2.1 |
| Real-time | Socket.IO Client | 4.8.3 |
| Notifications | React Toastify | 11.0.5 |
| Excel Export | xlsx / xlsx-js-style | 0.18.5 / 1.2.0 |
| PDF Export | jsPDF | 3.0.4 |
| Canvas Screenshot | html2canvas | 1.4.1 |
| CSV Parsing | PapaParse | 5.4.1 |
| Date Utilities | date-fns | 3.0.0 |
| Testing | Vitest + Testing Library | 1.2.0 |

---

## 3. Project Structure

```
frontend/
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite configuration (dev server + proxy)
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── tsconfig.json               # TypeScript configuration
├── tsconfig.node.json          # TypeScript config for Node (vite.config)
├── vitest.config.ts            # Vitest test configuration
├── package.json                # Dependencies and scripts
├── public/                     # Static assets served as-is
├── assets/                     # Additional static assets
└── src/
    ├── main.tsx                # React DOM entry point; React Query setup
    ├── App.tsx                 # Root component; auth routing logic
    ├── index.css               # Global CSS (Tailwind directives)
    ├── vite-env.d.ts           # Vite env variable type declarations
    ├── types/
    │   └── index.ts            # All TypeScript interfaces and enums
    ├── contexts/
    │   ├── AuthContext.tsx     # Authentication state + theme management
    │   └── AmendedDOsContext.tsx # Amended delivery orders global state
    ├── hooks/
    │   ├── useFuelStations.ts  # Fuel station config data hook
    │   ├── useRoutes.ts        # Route configuration data hook
    │   └── useTruckBatches.ts  # Truck batch data hook
    ├── services/
    │   ├── api.ts              # Axios instance, interceptors, all API calls
    │   ├── fuelRecordService.ts        # Fuel record CRUD operations
    │   ├── systemConfigService.ts      # System settings API
    │   ├── configService.ts            # Fuel/route configuration API
    │   ├── fuelConfigService.ts        # Station fuel configuration
    │   ├── lpoAutoFetchService.ts      # LPO auto-fill logic service
    │   ├── lpoForwardingService.ts     # LPO forwarding between stations
    │   ├── cancellationService.ts      # Order cancellation logic
    │   ├── yardFuelService.ts          # Yard fuel dispense API
    │   ├── adminConfigSyncService.ts   # Admin config synchronization
    │   ├── websocket.ts               # Socket.IO client setup
    │   └── mockData.ts                # Static mock data for development
    ├── utils/
    │   ├── permissions.ts      # RBAC constants and helper functions
    │   ├── activityTracker.ts  # Inactivity timer for auto-logout
    │   ├── timezone.ts         # Timezone setting utility
    │   ├── csvParser.ts        # CSV import parsing helpers
    │   ├── doNumberFormatter.ts # Delivery order number formatting
    │   ├── lpoTextGenerator.ts # Generate LPO text content
    │   ├── lpoImageGenerator.ts # Generate LPO image/PDF output
    │   └── dataCleanup.ts      # Data sanitization helpers
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── DeliveryOrders.tsx
    │   ├── LPOs.tsx
    │   ├── FuelRecords.tsx
    │   ├── YardFuel.tsx
    │   ├── PendingConfigurations.tsx
    │   ├── TruckBatches.tsx
    │   ├── TruckSelection.tsx
    │   ├── ForgotPassword.tsx
    │   ├── ResetPassword.tsx
    │   ├── FleetTracking.tsx
    │   ├── CheckpointManagement.tsx
    │   └── Admin/
    │       └── DriverCredentialsManager.tsx
    └── components/
        ├── EnhancedDashboard.tsx       # Main shell; role-based tab routing
        ├── Login.tsx
        ├── ProtectedRoute.tsx
        ├── Layout.tsx
        ├── AdminDashboard.tsx
        ├── StandardAdminDashboard.tsx
        ├── SuperAdminDashboard.tsx
        ├── ManagerView.tsx
        ├── DOManagement.tsx
        ├── LPOManagement.tsx
        ├── FuelRecords.tsx
        ├── DriverPortal.tsx
        ├── DriverPortalNew.tsx
        ├── OfficerPortal.tsx
        ├── PaymentManager.tsx
        ├── Reports.tsx
        ├── YardFuelSimple.tsx
        ├── StationView.tsx
        ├── MonthlySummary.tsx
        ├── FuelAnalytics.tsx
        ├── RouteManagement.tsx
        ├── TruckBatchManagement.tsx
        ├── NotificationBell.tsx
        ├── NotificationsPage.tsx
        ├── ThemeToggle.tsx
        ├── Pagination.tsx
        ├── ResponsiveTable.tsx
        ├── JourneyStatusBadge.tsx
        ├── PendingYardFuel.tsx
        ├── YardFuelAlertWidget.tsx
        ├── [... modal components ...]
        ├── [... form components ...]
        ├── [... print components ...]
        ├── StandardAdmin/          # Admin-specific tabs
        └── SuperAdmin/             # Super admin panel tabs
```

---

## 4. Architecture

### 4.1 Application Flow

```
main.tsx
  └── QueryClientProvider (React Query)
        └── App
              └── AuthProvider (AuthContext)
                    └── AmendedDOsProvider
                          └── Router
                                └── AppContent
                                      ├── (not authenticated) Routes → Login / ForgotPassword / ResetPassword
                                      └── (authenticated) ProtectedRoute → EnhancedDashboard
```

### 4.2 Data Flow

1. **API layer** (`services/api.ts`) contains an Axios instance with request/response interceptors for JWT token injection, CSRF token management, and automatic token refresh.
2. **React Query** caches server state, handles stale-time, background refetching, and retries.
3. **AuthContext** holds user session state (user object, permissions, theme) derived from `localStorage`.
4. **Component state** (local `useState`) handles ephemeral UI state like form inputs, modal visibility, and pagination.

### 4.3 Security

- JWT Bearer token stored in `localStorage`.
- CSRF protection: the frontend fetches an `XSRF-TOKEN` cookie on startup and sends it as a header (`X-XSRF-TOKEN`) on all state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`).
- All routes behind `ProtectedRoute` check both authentication status and permission.
- Inactivity auto-logout fires after **30 minutes** of no user interaction via `activityTracker`.
- RBAC enforced at both the route level and individual component/action level.

---

## 5. Getting Started

### Prerequisites

- Node.js ≥ 18
- Backend server running on `http://localhost:5000`

### Installation

```bash
cd frontend
npm install
```

### Development Server

```bash
npm run dev
```

Starts Vite on **http://localhost:3000**. All `/api/*` requests are proxied to `http://localhost:5000`.

### Build for Production

```bash
npm run build
```

Output goes to `frontend/dist/`.

### Preview Production Build

```bash
npm run preview
```

---

## 6. Authentication & Session Management

**File:** `src/contexts/AuthContext.tsx`

### Login Flow

1. User submits credentials on the `Login` component.
2. `AuthContext.login()` calls `authAPI.login(credentials)` → POST `/api/auth/login`.
3. Backend returns `{ user, accessToken, refreshToken }`.
4. `accessToken` is stored in `localStorage` as `fuel_order_token`.
5. User data is stored in `localStorage` as `fuel_order_auth`.
6. Role permissions are derived client-side from `getRolePermissions(user.role)`.
7. User-specific theme is loaded from `localStorage` key `fuel_order_theme_user_<id>`.
8. `AUTH_SUCCESS` action is dispatched; the app redirects to the dashboard.

### Session Restore

On page refresh, `AuthContext` reads `fuel_order_auth` from `localStorage` and reconstructs the authenticated state without a network request.

### Logout

1. Stops the inactivity tracker.
2. Removes `fuel_order_auth`, `fuel_order_token`, `fuel_order_active_tab`, `fuel_order_active_role` from `localStorage`.
3. Redirects to `/login`.

### Auto-Logout (Inactivity)

`activityTracker` (see `src/utils/activityTracker.ts`) listens for mouse/keyboard/scroll events. After **30 minutes** of inactivity, it calls the logout callback and redirects to `/login?reason=inactivity`.

### Theme Persistence

- Each user has their own theme key: `fuel_order_theme_user_<id>`.
- Supports `'light'` and `'dark'` modes.
- Falls back to `prefers-color-scheme` media query.
- Applied by toggling the `dark` CSS class on `document.documentElement`.

### AuthContext API

| Method / Property | Type | Description |
|---|---|---|
| `user` | `AuthUser \| null` | Currently logged-in user |
| `isAuthenticated` | `boolean` | Authentication status |
| `isLoading` | `boolean` | Loading state during login |
| `error` | `string \| null` | Last auth error message |
| `theme` | `'light' \| 'dark'` | Current theme |
| `isDark` | `boolean` | Convenience boolean for dark mode |
| `login(credentials)` | `Promise<void>` | Login with username/password |
| `logout()` | `void` | Log out and clear session |
| `clearError()` | `void` | Clear the auth error |
| `hasPermission(resource, action)` | `boolean` | Check a specific permission |
| `checkRouteAccess(route)` | `boolean` | Check access to a route path |
| `toggleTheme()` | `void` | Switch between light/dark |
| `setTheme(theme)` | `void` | Set theme explicitly |

---

## 7. Role-Based Access Control (RBAC)

**File:** `src/utils/permissions.ts`

The system has **19 user roles**. Permissions are defined as a static map — each role lists which `resource` + `actions` combinations it has access to.

### Resources

| Constant | Resource Key | Description |
|---|---|---|
| `DASHBOARD` | `dashboard` | Main dashboard access |
| `DELIVERY_ORDERS` | `delivery_orders` | DO management |
| `LPOS` | `lpos` | LPO management |
| `FUEL_RECORDS` | `fuel_records` | Fuel record tracking |
| `FLEET_TRACKING` | `fleet_tracking` | Fleet/journey tracking |
| `CHECKPOINTS` | `checkpoints` | Checkpoint management |
| `USERS` | `users` | User management |
| `REPORTS` | `reports` | Reporting & analytics |
| `SYSTEM_CONFIG` | `system_config` | System configuration |
| `AUDIT_LOGS` | `audit_logs` | Audit log viewing |
| `DATABASE_MONITOR` | `database_monitor` | DB health monitoring |
| `TRASH` | `trash` | Trash / data recovery |
| `NOTIFICATIONS` | `notifications` | System notifications |

### Actions

`read` · `create` · `update` · `delete` · `approve` · `manage` · `export` · `restore` · `permanent_delete`

### Roles

| Role | Description |
|---|---|
| `super_admin` | Full system access — all resources and actions |
| `admin` | All operations except user creation/deletion and permanent delete |
| `manager` | Approval rights, full DO/LPO/fuel-record CRUD, reporting |
| `super_manager` | Read + export access across all stations |
| `supervisor` | CRUD on DOs / LPOs / fuel records, no approval |
| `clerk` | Data entry — create/update DOs, LPOs, fuel records |
| `driver` | Read-only on orders; can update own fuel records |
| `viewer` | Read-only across all operational data |
| `fuel_order_maker` | Specialist — create/approve DOs, LPOs, fuel records |
| `boss` | Executive — full operational CRUD + reporting |
| `yard_personnel` | Create/update fuel records, read orders |
| `fuel_attendant` | Update fuel records and LPOs, read DOs |
| `station_manager` | Manage station ops — fuel records, LPO approval, reports |
| `payment_manager` | Update DOs / LPOs / fuel records (payment workflow) |
| `dar_yard` | Create fuel records for Dar Es Salaam yard only |
| `tanga_yard` | Create fuel records for Tanga yard only |
| `mmsa_yard` | Create fuel records for MMSA yard only |
| `import_officer` | CRUD + export on import delivery orders |
| `export_officer` | CRUD + export on export delivery orders |

### Helper Functions

```ts
getRolePermissions(role: UserRole): Permission[]
hasPermission(userPermissions, resource, action): boolean
canAccessRoute(userPermissions, route): boolean
getRoleInfo(role): { name, description, color }
getRoleColor(role): string  // Tailwind CSS class string
```

---

## 8. Routing

**File:** `src/App.tsx`

React Router DOM v6 is used. Routes are split into two trees based on authentication status.

### Unauthenticated Routes

| Path | Component | Description |
|---|---|---|
| `/forgot-password` | `ForgotPassword` | Password reset request |
| `/reset-password` | `ResetPassword` | New password entry via token |
| `*` (fallback) | `Login` | Login form |

### Authenticated Routes

All authenticated users are directed to `EnhancedDashboard` which internally handles role-specific tab routing.

| Path | Description |
|---|---|
| `/*` | `EnhancedDashboard` (wrapped in `ProtectedRoute`) |
| `/unauthorized` | `UnauthorizedPage` — shown when permission check fails |
| `/login` | Redirects to `/` |

### ProtectedRoute

`src/components/ProtectedRoute.tsx` checks `isAuthenticated` from the auth context. If not authenticated, it redirects to `/`. If a specific permission is required, it renders `UnauthorizedPage` when the check fails.

---

## 9. State Management

The application uses a **three-layer state model**:

| Layer | Tool | Purpose |
|---|---|---|
| **Server State** | TanStack React Query | API data, caching, background sync |
| **Global Client State** | React Context (Reducer) | Auth, user session, theme, amended DOs |
| **Local UI State** | `useState` / `useReducer` | Forms, modals, pagination, filters |

### React Query Configuration (`main.tsx`)

```ts
{
  staleTime: 5 * 60 * 1000,       // Data fresh for 5 minutes
  gcTime: 10 * 60 * 1000,         // Cache kept for 10 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 1,
}
```

---

## 10. Data Models (Types)

**File:** `src/types/index.ts`

All shared TypeScript interfaces are defined in a single file.

### Core Entities

#### `DeliveryOrder`

Represents one delivery order (DO or SDO).

| Field | Type | Description |
|---|---|---|
| `sn` | `number` | Serial number |
| `date` | `string` | ISO date string |
| `importOrExport` | `'IMPORT' \| 'EXPORT'` | Direction |
| `doType` | `'DO' \| 'SDO'` | Delivery order type |
| `doNumber` | `string` | Unique DO reference |
| `clientName` | `string` | Client name |
| `truckNo` | `string` | Truck registration |
| `trailerNo` | `string` | Trailer registration |
| `loadingPoint` | `string` | Origin port/yard |
| `destination` | `string` | Final destination |
| `haulier` | `string` | Transport company |
| `tonnages` | `number` | Cargo weight |
| `ratePerTon` | `number` | Rate per metric ton |
| `status` | `DOStatus` | `'active'` or `'cancelled'` |
| `editHistory` | `DeliveryOrderEditHistory[]` | Audit trail of edits |

#### `LPOSummary`

Represents a complete LPO document (sheet).

| Field | Type | Description |
|---|---|---|
| `lpoNo` | `string` | LPO reference number |
| `date` | `string` | Issue date |
| `station` | `string` | Fuel station (e.g., `'CASH'`) |
| `orderOf` | `string` | Company ordering fuel |
| `entries` | `LPODetail[]` | Line items (trucks) |
| `total` | `number` | Total liters |
| `createdBy` | `string` | Username |
| `approvedBy` | `string` | Approver name |
| `forwardedFrom` | `object` | Source LPO reference if forwarded |

#### `LPODetail`

A single line item (truck entry) within an LPO.

| Field | Type | Description |
|---|---|---|
| `doNo` | `string` | Associated DO number |
| `truckNo` | `string` | Truck registration |
| `liters` | `number` | Fuel quantity |
| `rate` | `number` | Price per liter |
| `amount` | `number` | `liters × rate` |
| `dest` | `string` | Destination |
| `isCancelled` | `boolean` | Whether this entry is cancelled |
| `paymentMode` | `'STATION' \| 'CASH' \| 'DRIVER_ACCOUNT'` | Payment method |

#### `FuelRecord`

Tracks fuel dispensed at each checkpoint on a journey.

| Field | Type | Description |
|---|---|---|
| `truckNo` | `string` | Truck registration |
| `goingDo` | `string` | Going direction DO number |
| `returnDo` | `string` | Returning direction DO number |
| `journeyStatus` | `JourneyStatus` | `queued \| active \| completed \| cancelled` |
| `totalLts` | `number` | Total fuel allocation |
| `mmsaYard` / `tangaYard` / `darYard` | `number` | Yard fuel top-ups |
| `darGoing` → `tangaReturn` | `number` | Fuel at each checkpoint |
| `balance` | `number` | Remaining fuel |

#### `User`

| Field | Type | Description |
|---|---|---|
| `username` | `string` | Login username |
| `email` | `string` | Email address |
| `role` | `UserRole` | One of 19 roles |
| `station` | `string` | Assigned station (station roles) |
| `yard` | `string` | Assigned yard (yard roles) |
| `truckNo` | `string` | Assigned truck (driver role) |
| `isActive` | `boolean` | Account active status |
| `isBanned` | `boolean` | Account banned status |

#### `YardFuelDispense`

Fuel dispensed at a yard (MMSA, Tanga, or Dar).

| Field | Type | Description |
|---|---|---|
| `truckNo` | `string` | Truck receiving fuel |
| `liters` | `number` | Quantity dispensed |
| `yard` | `'DAR YARD' \| 'TANGA YARD' \| 'MMSA YARD'` | Dispensing yard |
| `status` | `'pending' \| 'linked' \| 'manual'` | Link status to a fuel record |
| `linkedDONumber` | `string` | Auto-matched DO number |

### Workbook Types

The system uses an Excel-like workbook/sheet concept:

| Type | Description |
|---|---|
| `DOWorkbook` | One per year; contains multiple `DeliveryOrder` sheets |
| `LPOWorkbook` | One per year; contains multiple `LPOSummary` sheets |
| `DriverAccountWorkbook` | One per year; records of driver account fuel entries |

### Supporting Types

| Type | Description |
|---|---|
| `AuditLog` | System-wide audit trail entry |
| `Notification` | In-app notification (missing fuel, yard alerts, etc.) |
| `Backup` / `BackupSchedule` | Backup metadata and schedule |
| `DatabaseMetrics` | DB performance and storage stats |
| `FuelStationConfig` | Per-station fuel defaults (liters, rate, checkpoint mapping) |
| `RouteConfig` | Route definitions with destination aliases and liters |
| `DriverAccountEntry` | Individual driver account (cash/mobile payment) record |
| `CancellationInfo` | Details when an LPO entry is cancelled at a checkpoint |
| `DashboardStats` / `DashboardAnalytics` | Aggregated stats for the dashboard |

---

## 11. Pages

Pages are thin wrapper components that compose feature components and handle top-level data fetching.

### `Dashboard.tsx`

Displays summary statistics: total DOs, LPOs, fuel records, active trips, tonnage, liters, and revenue. Includes recent activity feed. Renders charts via Recharts.

### `DeliveryOrders.tsx`

Full-page view for Delivery Order management. Renders `DOManagement` component. Supports creation, editing, cancellation, and export of DOs.

### `LPOs.tsx`

Full-page view for LPO management. Renders `LPOManagement` component. Supports workbook navigation, sheet creation, LPO forwarding, and export.

### `FuelRecords.tsx`

Full-page fuel record tracking. Renders `FuelRecords` component. Supports per-checkpoint fuel entry and journey status management.

### `YardFuel.tsx`

Yard fuel entry and linking for authorized yard personnel (DAR YARD, TANGA YARD, MMSA YARD roles).

### `PendingConfigurations.tsx`

Lists fuel records with pending configuration (missing total liters or extra fuel). Allows resolving pending items.

### `TruckBatches.tsx`

Manages truck batch assignments. Uses `TruckBatchManagement` component.

### `TruckSelection.tsx`

Allows selecting which trucks are included in a batch or a fuel order batch.

### `ForgotPassword.tsx`

Public page. Accepts username/email to send a password reset link.

### `ResetPassword.tsx`

Public page. Accepts a reset token (from URL query param) and new password.

### `FleetTracking.tsx`

Interactive fleet tracking using Leaflet map. Shows active journeys and truck positions.

### `CheckpointManagement.tsx`

Admin-accessible page for managing fuel checkpoint configurations.

### `Admin/DriverCredentialsManager.tsx`

Allows admins to manage driver login credentials (create/reset driver passwords).

---

## 12. Components

### Shell Components

#### `EnhancedDashboard.tsx`

The main application shell displayed after login. Renders the navigation sidebar/tabs and loads role-appropriate dashboards. Handles the active-tab state persisted in `localStorage` as `fuel_order_active_tab`.

#### `Layout.tsx`

Provides the main page layout with a sidebar, top bar (user info, notification bell, theme toggle), and content area.

#### `ProtectedRoute.tsx`

HOC wrapper that redirects unauthenticated users to login. Optionally checks for a specific permission before rendering children. Also exports `UnauthorizedPage`.

#### `Login.tsx`

Login form component. Calls `AuthContext.login()`. Shows error messages from the auth context on failure. Links to `ForgotPassword`.

#### `ThemeToggle.tsx`

Button component to toggle between light and dark theme. Uses sun/moon icons from Lucide.

#### `NotificationBell.tsx`

Shows a notification icon with an unread count badge. Opens a dropdown or navigates to `NotificationsPage` on click.

### Role-Based Dashboards

#### `AdminDashboard.tsx`

Renders the appropriate sub-dashboard based on role: `SuperAdminDashboard` or `StandardAdminDashboard`.

#### `SuperAdminDashboard.tsx`

Tab-based admin panel with tabs delegated to `SuperAdmin/` sub-components.

#### `StandardAdminDashboard.tsx`

Simplified admin panel with tabs from `StandardAdmin/` sub-components.

#### `ManagerView.tsx`

Dashboard for manager-level roles. Shows operational overview and reports.

#### `DriverPortal.tsx` / `DriverPortalNew.tsx`

Driver-facing view showing the assigned truck, current DO, and fuel allocation.

#### `OfficerPortal.tsx`

For import/export officers. Shows DOs filtered to their direction (IMPORT or EXPORT).

#### `StationView.tsx`

Station personnel view showing LPOs relevant to their assigned station.

#### `PaymentManager.tsx`

Dedicated view for payment managers to update and track payment status on orders.

### Super Admin Sub-tabs (`components/SuperAdmin/`)

| Component | Description |
|---|---|
| `SystemConfigDashboard.tsx` | Overview of system health and configuration |
| `UserManagementTab.tsx` | Create, edit, ban/unban, and delete users |
| `AnalyticsTab.tsx` | Detailed analytics and charts |
| `AuditLogsTab.tsx` | View and filter system audit logs |
| `BackupRecoveryTab.tsx` | Trigger manual backups, view backup history |
| `ConfigurationTab.tsx` | System-wide configuration settings |
| `DatabaseMonitorTab.tsx` | Real-time database metrics and slow queries |
| `FuelStationsTab.tsx` | Manage fuel station configurations |
| `RoutesTab.tsx` | Define and edit route configurations |
| `SecurityTab.tsx` | Security settings and session management |
| `SystemHealthTab.tsx` | Server health, uptime, and resource usage |
| `TrashManagementTab.tsx` | Restore or permanently delete trashed items |
| `ArchivalManagementTab.tsx` | Archival policies and archived data access |

### Standard Admin Sub-tabs (`components/StandardAdmin/`)

| Component | Description |
|---|---|
| `OperationalOverviewTab.tsx` | High-level operational summary |
| `BasicReportsTab.tsx` | Essential reports for standard admins |
| `DataManagementTab.tsx` | CSV import and data management |
| `QuickActionsPanel.tsx` | Shortcut actions panel |
| `UserSupportTab.tsx` | Assist users, reset passwords |

### Data Management Components

#### `DOManagement.tsx`

Core delivery order management. Features:
- Workbook/sheet navigation (DOWorkbook → DOSheetView)
- Create new DO (DOForm)
- Bulk DO creation (BulkDOForm)
- Cancel DO with reason (CancelDOModal)
- Detailed DO view (DODetailModal)
- Print delivery note (DeliveryNotePrint) and master DO (MasterDOPrint)
- Batch print (BatchDOPrint)
- Excel export

#### `LPOManagement.tsx`

Local Purchase Order management. Features:
- LPO Workbook navigation (LPOWorkbook → LPOSheetView → LPOSummary)
- Create/edit LPO (LPOForm / LPODetailForm)
- Forward LPO to another station (ForwardLPOModal)
- Print LPO as image (LPOPrint / lpoImageGenerator)
- Generate LPO text (lpoTextGenerator)
- Cancellation tracking (CancellationHistoryModal)
- Export to Excel

#### `FuelRecords.tsx`

Fuel record management. Features:
- Per-checkpoint fuel entry (FuelRecordForm)
- Journey status management (activate, complete, cancel)
- Inspect record details (FuelRecordInspectModal / FuelRecordDetailsModal)
- Yard fuel integration
- Journey status badge (JourneyStatusBadge)

#### `YardFuelSimple.tsx`

Simplified yard fuel entry for yard personnel. Shows pending yard fuel entries and allows linking to fuel records.

### Utility Components

| Component | Description |
|---|---|
| `Pagination.tsx` | Generic pagination controls |
| `ResponsiveTable.tsx` | Table with horizontal scroll on mobile |
| `JourneyStatusBadge.tsx` | Colored badge for journey status |
| `YardFuelAlertWidget.tsx` | Alert widget for unlinked yard fuel |
| `PendingYardFuel.tsx` | List of pending yard fuel entries |
| `MonthlySummary.tsx` | Monthly aggregation summary view |
| `FuelAnalytics.tsx` | Fuel consumption analytics charts |
| `RouteManagement.tsx` | Admin route configuration UI |
| `TruckBatchManagement.tsx` | Truck batch creation and management |
| `NotificationsPage.tsx` | Full-page notifications list |
| `AmendedDOsModal.tsx` | View amended delivery orders |
| `StationSelectorModal.tsx` | Station selection modal |
| `CreateUserModal.tsx` | User creation form modal |
| `ChangePasswordModal.tsx` | Password change modal |
| `ThemeDebugPanel.tsx` | Development tool for theme debugging |
| `DarkModeShowcase.tsx` | Development showcase for dark mode styles |

### Print Components

| Component | Description |
|---|---|
| `DeliveryNotePrint.tsx` | Printable delivery note template |
| `MasterDOPrint.tsx` | Master delivery order print layout |
| `BatchDOPrint.tsx` | Batch of DOs print layout |
| `LPOPrint.tsx` | LPO document print layout |

### Form Components

| Component | Description |
|---|---|
| `DOForm.tsx` | Single delivery order creation/edit form |
| `BulkDOForm.tsx` | Create multiple DOs at once |
| `LPOForm.tsx` | LPO summary header form |
| `LPODetailForm.tsx` | Individual LPO line item form |
| `FuelRecordForm.tsx` | Fuel record entry form (all checkpoints) |

### Modal Components

| Component | Description |
|---|---|
| `DODetailModal.tsx` | Read-only DO detail view |
| `DOSheetView.tsx` | Sheet-style DO detail within workbook |
| `CancelDOModal.tsx` | DO cancellation with reason input |
| `CancellationHistoryModal.tsx` | History of LPO cancellations |
| `ForwardLPOModal.tsx` | Forward an LPO to another station |
| `FuelRecordDetailsModal.tsx` | Detailed fuel record view |
| `FuelRecordInspectModal.tsx` | Inspect fuel record with checkpoint breakdown |

### Workbook Components

| Component | Description |
|---|---|
| `DOWorkbook.tsx` | Excel-like workbook view for DOs (tabs = DOs) |
| `LPOWorkbook.tsx` | Excel-like workbook view for LPOs |
| `LPOSheetView.tsx` | Single LPO sheet view within workbook |
| `LPOSummary.tsx` | LPO document summary display |
| `DriverAccountWorkbook.tsx` | Driver account entries workbook |

---

## 13. Services & API Layer

**File:** `src/services/api.ts`

### Axios Instance

```ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // Enables cookies for CSRF
});
```

### Interceptors

**Request interceptor** automatically:
1. Injects `Authorization: Bearer <token>` from `localStorage`.
2. Fetches and injects `X-XSRF-TOKEN` header for mutating requests.

**Response interceptor** handles:
- `401 Unauthorized` → clears session and redirects to `/login`.
- General error normalization.

### API Modules in `api.ts`

| Export | Description |
|---|---|
| `authAPI` | `login()`, `logout()`, `forgotPassword()`, `resetPassword()` |
| `deliveryOrderAPI` | CRUD for DOs, workbooks, cancel, bulk create, export |
| `lpoAPI` | CRUD for LPO summaries, workbooks, entries |
| `fuelRecordAPI` | CRUD for fuel records, journey status updates |
| `userAPI` | User management, ban/unban, password reset |
| `reportAPI` | Revenue, fuel, user activity reports |
| `dashboardAPI` | Stats and analytics |
| `yardFuelAPI` | Yard fuel dispense CRUD and linking |
| `notificationAPI` | Fetch, mark-read, dismiss notifications |
| `trashAPI` | List, restore, permanent delete |
| `auditLogAPI` | Fetch and filter audit logs |
| `databaseAPI` | Database metrics |
| `backupAPI` | Trigger, list, download backups |

### Additional Service Files

| File | Purpose |
|---|---|
| `fuelRecordService.ts` | Extended fuel record operations with journey management |
| `systemConfigService.ts` | Get/update system settings (timezone, general config) |
| `configService.ts` | Fuel station and route configuration CRUD |
| `fuelConfigService.ts` | Fuel station-specific configuration management |
| `lpoAutoFetchService.ts` | Logic to auto-fill LPO entries based on DO data |
| `lpoForwardingService.ts` | Handle LPO forwarding between stations |
| `cancellationService.ts` | LPO cancellation at checkpoint with driver account generation |
| `yardFuelService.ts` | Yard fuel dispense with auto-linking to fuel records |
| `adminConfigSyncService.ts` | Sync admin configurations across the system |
| `websocket.ts` | Socket.IO client; connects to backend WebSocket for real-time notifications |
| `mockData.ts` | Static mock data used during development/testing |

### WebSocket (`websocket.ts`)

Establishes a Socket.IO connection to `http://localhost:5000`. Used for:
- Real-time notification delivery.
- Live yard fuel alerts.
- Journey status updates.

---

## 14. Hooks

Custom hooks encapsulate data-fetching with React Query.

### `useFuelStations()` — `src/hooks/useFuelStations.ts`

Fetches the list of fuel station configurations from the backend.

```ts
const { stations, isLoading, error } = useFuelStations();
```

Returns `FuelStationConfig[]` — used to populate station selectors in LPO forms and route configuration.

### `useRoutes()` — `src/hooks/useRoutes.ts`

Fetches route configurations.

```ts
const { routes, isLoading, error } = useRoutes();
```

Returns `RouteConfig[]` — used in fuel record forms to auto-suggest total liters based on the destination.

### `useTruckBatches()` — `src/hooks/useTruckBatches.ts`

Fetches truck batch assignments.

```ts
const { batches, isLoading, createBatch, updateBatch } = useTruckBatches();
```

Used in `TruckBatchManagement` component.

---

## 15. Contexts

### `AuthContext` (`src/contexts/AuthContext.tsx`)

Global authentication and theme state. Covered in full detail in [Section 6](#6-authentication--session-management).

**Consumer hook:** `useAuth()` — throws if used outside `AuthProvider`.

### `AmendedDOsContext` (`src/contexts/AmendedDOsContext.tsx`)

Tracks which Delivery Orders have been amended during the current session so that the `AmendedDOsModal` can display a list of recent amendments without re-fetching.

```ts
const { amendedDOs, addAmendedDO, clearAmendedDOs } = useAmendedDOs();
```

**Provider:** `AmendedDOsProvider` — wraps the entire app in `App.tsx`.

---

## 16. Utilities

### `permissions.ts`

Exports `RESOURCES`, `ACTIONS`, `ROLE_PERMISSIONS`, and helper functions. See [Section 7](#7-role-based-access-control-rbac).

### `activityTracker.ts`

Singleton that tracks user activity (mouse move, keyboard, scroll, touch). Calls the provided logout callback after 30 minutes of inactivity.

```ts
activityTracker.start(onInactive: () => void): void
activityTracker.stop(): void
```

### `timezone.ts`

```ts
setSystemTimezone(timezone: string): void
```

Sets a module-level timezone variable (`Africa/Dar_es_Salaam` default) used when formatting dates throughout the app.

### `csvParser.ts`

Utilities for parsing CSV files (using PapaParse) for bulk imports of DOs and LPOs.

```ts
parseDeliveryOrdersCSV(file: File): Promise<DeliveryOrder[]>
parseLPOCSV(file: File): Promise<LPOEntry[]>
```

### `doNumberFormatter.ts`

Formats DO numbers for display and ensures consistent numbering conventions (e.g., zero-padding, prefix application).

### `lpoTextGenerator.ts`

Generates plain-text LPO content suitable for system messages or email bodies.

```ts
generateLPOText(lpo: LPOSummary): string
```

### `lpoImageGenerator.ts`

Uses `html2canvas` and `jsPDF` to render an LPO summary into a downloadable PDF or image.

```ts
generateLPOImage(lpo: LPOSummary): Promise<void>
generateLPOPDF(lpo: LPOSummary): Promise<void>
```

### `dataCleanup.ts`

Sanitization functions to normalize data from CSV imports or legacy data formats before saving.

---

## 17. Styling

### Tailwind CSS

Utility-first CSS with a custom configuration (`tailwind.config.js`). Dark mode is enabled using the `class` strategy (toggled via `document.documentElement.classList`).

Custom color tokens defined in the config extend the default Tailwind palette to include `primary` shades used for buttons, links, and active tab indicators.

### PostCSS

Standard PostCSS setup — `tailwindcss` and `autoprefixer` plugins.

### Global CSS (`src/index.css`)

Contains Tailwind directives:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Plus any global overrides for scrollbar styling, print media queries, and animation classes.

---

## 18. Configuration Files

### `vite.config.ts`

```ts
{
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
}
```

All `/api/*` requests from the dev server are proxied to the backend, avoiding CORS issues in development.

### `tsconfig.json`

Standard strict TypeScript configuration targeting `ESNext` with `bundler` module resolution (for Vite compatibility).

### `vitest.config.ts`

Configures Vitest with:
- `jsdom` environment for browser-like test runtime.
- Coverage via `@vitest/coverage-v8`.
- Setup files for `@testing-library/jest-dom` matchers.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Backend API base URL. Override for production. |

---

## 19. Testing

**Test Runner:** Vitest  
**DOM Environment:** jsdom  
**Libraries:** `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`

### Scripts

```bash
npm run test            # Watch mode
npm run test:run        # Run once
npm run test:coverage   # Run with V8 coverage report
npm run test:ui         # Interactive Vitest UI
```

Coverage reports are generated at `frontend/coverage/`.

### Test Location

Tests live in `src/tests/` and optionally alongside components as `*.test.ts(x)` files.

---

## 20. Build & Deployment

### Build

```bash
npm run build
```

Runs TypeScript compiler (`tsc`) first, then Vite production build. Output is written to `frontend/dist/`.

### Linting

```bash
npm run lint
```

Runs ESLint with TypeScript and React Hooks plugins. Zero warnings allowed (`--max-warnings 0`).

### Production API URL

Set the environment variable `VITE_API_BASE_URL` to point to the production backend:

```env
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

### Serving

The `dist/` folder is a static SPA. It requires the web server to redirect all routes to `index.html` for client-side routing to work (standard `try_files` nginx configuration or equivalent).

---

## Appendix: Key Data Flows

### Creating a Delivery Order

```
User fills DOForm
  → POST /api/delivery-orders
  → React Query invalidates deliveryOrders cache
  → DOManagement re-renders with new DO
  → Audit log entry created on backend
```

### LPO Auto-Fill

```
User selects DO in LPODetailForm
  → lpoAutoFetchService.getAutoFillData(doNumber)
  → Matches DO to fuel station config via route
  → Returns suggested liters, rate, destination
  → Form pre-populated; user can override
```

### Yard Fuel Entry

```
Yard personnel enters truck + liters in YardFuelSimple
  → POST /api/yard-fuel
  → Backend attempts auto-linking to active FuelRecord for that truck
  → If linked: status = 'linked', FuelRecord updated at yard checkpoint
  → If no active record: status = 'pending', notification generated
  → WebSocket event sent to operations staff
```

### Journey Status Flow

```
FuelRecord created (journeyStatus = 'queued')
  → Supervisor activates (journeyStatus = 'active')
  → Fuel checkpoints filled at each station
  → Journey marked complete (journeyStatus = 'completed')
  → Or cancelled at any point (journeyStatus = 'cancelled')
```

### Password Reset

```
User clicks Forgot Password → POST /api/auth/forgot-password (username/email)
  → Backend sends reset email with token link
  → User opens /reset-password?token=<token>
  → POST /api/auth/reset-password (token + newPassword)
  → Session cleared, redirect to Login
```
