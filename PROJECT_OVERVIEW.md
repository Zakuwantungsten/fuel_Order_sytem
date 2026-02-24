# Fuel Order Management System — Project Overview

## Tech Stack

### Backend
| Category | Technology |
|---|---|
| **Runtime** | Node.js |
| **Language** | TypeScript |
| **Framework** | Express.js v4 |
| **Database** | MongoDB (via Mongoose v8) |
| **Authentication** | JWT (`jsonwebtoken`) + `bcryptjs` for password hashing |
| **Real-time** | Socket.IO v4 (WebSockets) |
| **File Storage** | AWS S3 / Cloudflare R2 (`@aws-sdk/client-s3`) |
| **Email** | Nodemailer |
| **PDF Generation** | PDFKit |
| **Excel/Spreadsheet** | ExcelJS + XLSX |
| **Scheduling** | node-cron |
| **Logging** | Winston + Morgan |
| **Archiving** | Archiver |

### Frontend
| Category | Technology |
|---|---|
| **Language** | TypeScript |
| **Framework** | React 18 |
| **Build Tool** | Vite v5 |
| **Routing** | React Router DOM v6 |
| **State/Data Fetching** | TanStack React Query v5 |
| **HTTP Client** | Axios |
| **UI Styling** | Tailwind CSS v3 |
| **Icons** | Lucide React |
| **Charts/Analytics** | Recharts |
| **Maps** | Leaflet + React Leaflet |
| **Notifications** | React Toastify |
| **PDF Export** | jsPDF + html2canvas |
| **Excel Export** | xlsx + xlsx-js-style |
| **CSV Parsing** | PapaParse |
| **Date Utilities** | date-fns |
| **Real-time** | Socket.IO Client |

---

## Security Middleware (Backend)
- **Helmet** — HTTP security headers
- **CORS** — Cross-origin resource sharing
- **express-rate-limit** — Rate limiting
- **express-validator** — Input validation
- **csurf** — CSRF protection
- **cookie-parser** — Cookie handling
- **compression** — Response compression

---

## Testing Tools
| Layer | Tool |
|---|---|
| **Backend** | Jest (unit + integration tests) |
| **Frontend** | Vitest + @testing-library/react |
| **Frontend UI** | @vitest/ui + jsdom |
| **Coverage** | jest --coverage / vitest --coverage (v8) |

---

## Development Tools
- **nodemon** — Auto-restart backend on changes
- **ts-node** — Run TypeScript scripts directly
- **ESLint** — Linting (TypeScript rules for both layers)
- **PostCSS + Autoprefixer** — CSS processing
- **dotenv** — Environment variable management

---

## Project Structure

```
Fuel_Order/
├── backend/
│   └── src/
│       ├── server.ts           # App entry point
│       ├── config/             # DB connection, env config
│       ├── controllers/        # Route handlers (22 controllers)
│       ├── models/             # Mongoose schemas (21 models)
│       ├── routes/             # Express routers
│       ├── middleware/         # Auth, error, CSRF, etc.
│       ├── services/           # Email, archival, backup, R2, WebSocket
│       ├── jobs/               # Cron job schedulers
│       ├── scripts/            # DB seed, migration, import scripts
│       ├── types/              # TypeScript type definitions
│       └── utils/              # Logger and shared utilities
│
├── frontend/
│   └── src/
│       ├── App.tsx             # Root component + routing
│       ├── main.tsx            # React DOM entry point
│       ├── pages/              # Route-level page components
│       ├── components/         # Reusable UI components
│       ├── contexts/           # React Context providers
│       ├── hooks/              # Custom React hooks
│       ├── services/           # API call abstraction (Axios)
│       ├── types/              # TypeScript interfaces
│       └── utils/              # Frontend helpers
```

---

## Key Domain Models

| Model | Description |
|---|---|
| `User` | System users with roles (SuperAdmin, Admin, Driver, etc.) |
| `DeliveryOrder` | Fuel delivery orders |
| `FuelRecord` | Individual fuel transaction records |
| `LPOEntry` | Local Purchase Order line items |
| `LPOSummary` | Aggregated LPO summaries |
| `LPOWorkbook` | LPO workbook groupings |
| `YardFuelDispense` | Yard-level fuel dispensing records |
| `DriverAccountEntry` | Driver account ledger entries |
| `DriverCredential` | Driver login credentials |
| `Notification` | In-app notifications |
| `AuditLog` | System audit trail |
| `Backup` | Backup metadata records |
| `ArchivedData` | Soft-deleted / archived documents |
| `TruckPosition` | Real-time truck GPS positions |
| `FleetSnapshot` | Point-in-time fleet state snapshots |
| `Checkpoint` | Route checkpoint definitions |
| `RouteConfig` | Route configuration |
| `SystemConfig` | Global system configuration |
| `FuelStationConfig` | Per-station fuel configuration |
| `BackupSchedule` | Scheduled backup configuration |

---

## Backend Scripts (npm run)

| Script | Purpose |
|---|---|
| `dev` | Start development server with nodemon |
| `build` | Compile TypeScript to JavaScript |
| `start` | Run compiled production server |
| `test` | Run all Jest tests |
| `test:unit` | Run unit tests only |
| `test:integration` | Run integration tests only |
| `test:coverage` | Run tests with coverage report |
| `seed` | Seed super admin user |
| `seed:admins` | Seed admin users |
| `seed:all` | Seed all roles |
| `seed:checkpoints` | Seed route checkpoints |
| `db:clear` | Clear all database data |
| `import:excel` | Import data from Excel file |
| `migrate:fuel-logic` | Run fuel calculation migration |
| `migrate:lpo-dates` | Migrate LPO actual dates |
| `verify:balance` | Verify balance calculations |
| `archival:run` | Execute data archival |
| `archival:stats` | View archival statistics |

---

## Summary

This is a **full-stack fuel logistics management system** — a REST API + real-time WebSocket backend paired with a React SPA frontend, backed by MongoDB, with:

- Cloud file storage (Cloudflare R2 / AWS S3)
- Automated cron scheduling
- Email notifications
- Excel and PDF reporting/export
- Live fleet tracking via Leaflet maps
- Role-based access control (RBAC)
- CSRF, rate-limiting, and helmet security hardening
- Full test coverage (unit + integration)
- Data archival and backup systems
