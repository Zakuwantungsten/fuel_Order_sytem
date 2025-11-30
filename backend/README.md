# Fuel Order Management System - Backend

Backend API for the Fuel Order Management System built with Node.js, Express, TypeScript, and MongoDB Atlas.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **RESTful API**: Complete CRUD operations for all entities
- **Security**: Rate limiting, helmet, CORS, input validation
- **Logging**: Winston for structured logging
- **Database**: MongoDB with Mongoose ODM
- **TypeScript**: Full type safety

## Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your MongoDB Atlas URI and other configurations

## Running the Server

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Delivery Orders
- `GET /api/delivery-orders` - Get all DOs (with pagination & filters)
- `GET /api/delivery-orders/:id` - Get single DO
- `POST /api/delivery-orders` - Create new DO
- `PUT /api/delivery-orders/:id` - Update DO
- `DELETE /api/delivery-orders/:id` - Soft delete DO

### LPO Entries
- `GET /api/lpo-entries` - Get all LPO entries
- `GET /api/lpo-entries/:id` - Get single entry
- `POST /api/lpo-entries` - Create new entry
- `PUT /api/lpo-entries/:id` - Update entry
- `DELETE /api/lpo-entries/:id` - Delete entry

### LPO Documents
- `GET /api/lpo-documents` - Get all LPO documents
- `GET /api/lpo-documents/:id` - Get single document
- `GET /api/lpo-documents/lpo/:lpoNo` - Get by LPO number
- `POST /api/lpo-documents` - Create new document
- `PUT /api/lpo-documents/:id` - Update document
- `DELETE /api/lpo-documents/:id` - Delete document

### Fuel Records
- `GET /api/fuel-records` - Get all fuel records
- `GET /api/fuel-records/:id` - Get single record
- `POST /api/fuel-records` - Create new record
- `PUT /api/fuel-records/:id` - Update record
- `DELETE /api/fuel-records/:id` - Delete record

### Yard Fuel
- `GET /api/yard-fuel` - Get all yard fuel entries
- `GET /api/yard-fuel/:id` - Get single entry
- `POST /api/yard-fuel` - Create new entry
- `PUT /api/yard-fuel/:id` - Update entry
- `DELETE /api/yard-fuel/:id` - Delete entry

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get single user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Custom middleware
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── types/          # TypeScript types
│   ├── utils/          # Helper functions
│   └── server.ts       # Entry point
├── dist/               # Compiled JavaScript
├── logs/               # Application logs
└── package.json
```

## Environment Variables

See `.env.example` for all required environment variables.

## Security Features

- JWT token authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization
- Soft delete for data retention

## License

ISC
