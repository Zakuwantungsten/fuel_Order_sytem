# Tech Stack — Fuel Order Management System

## Backend (`/backend`)

| Category | Technology |
|---|---|
| **Runtime** | Node.js 20 (Alpine Docker) |
| **Language** | TypeScript 5.3 |
| **Framework** | Express.js 4 |
| **Database** | MongoDB + Mongoose 8 |
| **Cache / Queue** | Redis (ioredis) + BullMQ |
| **Real-time** | Socket.io 4 + Redis adapter |
| **Auth** | JWT, bcryptjs, speakeasy (2FA/TOTP) |
| **File Storage** | AWS S3 (SDK v3) |
| **Email** | Nodemailer |
| **Document Generation** | PDFKit, ExcelJS, xlsx |
| **Push Notifications** | web-push (Web), Expo Server SDK (Mobile) |
| **Scheduled Jobs** | node-cron |
| **Logging** | Winston, Morgan |
| **Security Middleware** | Helmet, CORS, express-rate-limit, express-mongo-sanitize, csurf, express-validator, Multer |
| **Testing** | Jest, ts-jest, Supertest, mongodb-memory-server |
| **Deployment** | Docker, Railway |

---

## Frontend (`/frontend`)

| Category | Technology |
|---|---|
| **Language** | TypeScript 5.2 |
| **Framework** | React 18 |
| **Build Tool** | Vite 5 |
| **Styling** | Tailwind CSS 3, PostCSS |
| **Routing** | React Router v6 |
| **Data Fetching** | TanStack Query (React Query v5), Axios |
| **Real-time** | Socket.io-client 4 |
| **Charts** | Recharts |
| **Maps** | Leaflet + react-leaflet |
| **Icons** | lucide-react |
| **Date Utilities** | date-fns |
| **PDF / Excel Export** | jsPDF, html2canvas, xlsx, xlsx-js-style |
| **CSV Parsing** | PapaParse |
| **QR Codes** | react-qr-code |
| **Virtualized Lists** | react-window |
| **Notifications (UI)** | react-toastify |
| **Testing** | Vitest, Testing Library |
| **Deployment** | Firebase Hosting, Vercel |

---

## Mobile (`/mobile`)

| Category | Technology |
|---|---|
| **Framework** | React Native 0.83 + Expo 55 |
| **Language** | TypeScript 5.9 |

---

## Infrastructure

| Category | Technology |
|---|---|
| **Containerization** | Docker + Docker Compose |
| **Backend Hosting** | Railway |
| **Frontend Hosting** | Firebase Hosting / Vercel |
| **Database** | MongoDB (hosted) |
| **Cache / Queue Broker** | Redis |
