# Integration & Unit Testing Guide - Fuel Order Management System

## Overview

This document provides comprehensive guidance on running unit and integration tests for both the backend and frontend of the Fuel Order Management System.

## Backend Testing

### Setup

The backend uses Jest with MongoDB Memory Server for testing.

```bash
cd backend

# Install dependencies (if not already done)
npm install

# Install test dependencies
npm install --save-dev mongodb-memory-server supertest ts-jest @types/supertest
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Test Structure

```
backend/src/__tests__/
├── setup.ts                          # Test setup and MongoDB connection
├── helpers/
│   └── testUtils.ts                  # Test data factories and utilities
├── unit/
│   ├── models/
│   │   ├── User.test.ts              # User model tests
│   │   ├── DeliveryOrder.test.ts     # DO model tests
│   │   └── FuelRecord.test.ts        # Fuel record model tests
│   ├── utils/
│   │   ├── pagination.test.ts        # Pagination utility tests
│   │   ├── formatters.test.ts        # Formatter utility tests
│   │   └── jwt.test.ts               # JWT utility tests
│   └── middleware/
│       └── auth.test.ts              # Authentication middleware tests
└── integration/
    ├── auth.test.ts                  # Authentication API tests
    ├── deliveryOrder.test.ts         # Delivery Order API tests
    └── fuelRecord.test.ts            # Fuel Record API tests
```

### Test Descriptions

#### Unit Tests

**Models:**
- `User.test.ts`: User creation, validation, password hashing, role assignment, ban functionality
- `DeliveryOrder.test.ts`: DO creation, validation, status management, edit history tracking
- `FuelRecord.test.ts`: Fuel record creation, allocation validations, journey tracking

**Utilities:**
- `pagination.test.ts`: Pagination parameter parsing, skip calculation, paginated response creation
- `formatters.test.ts`: Truck number formatting (T123ABC → T123 ABC)
- `jwt.test.ts`: Token generation and verification

**Middleware:**
- `auth.test.ts`: Authentication and authorization middleware

#### Integration Tests

- `auth.test.ts`: Login, registration, token refresh, logout flows
- `deliveryOrder.test.ts`: CRUD operations, filtering, cancellation, cascade updates
- `fuelRecord.test.ts`: Fuel record management, journey tracking, dispense updates

---

## Frontend Testing

### Setup

The frontend uses Vitest with React Testing Library.

```bash
cd frontend

# Install dependencies
npm install

# Install test dependencies
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

### Running Tests

```bash
# Run all tests
npm test

# Run with UI (interactive mode)
npm run test:ui

# Run with coverage
npm run test:coverage

# Run once (CI mode)
npm run test:run
```

### Test Structure

```
frontend/src/tests/
├── setup.ts                          # Test setup with mocks
├── testUtils.tsx                     # Test utilities and factories
├── unit/
│   ├── fuelConfigService.test.ts     # Fuel configuration tests
│   ├── api.test.ts                   # API service tests
│   ├── Login.test.tsx                # Login component tests
│   └── components.test.tsx           # General component tests
└── integration/
    └── workflows.test.ts             # End-to-end workflow tests
```

### Test Descriptions

#### Unit Tests

**Services:**
- `fuelConfigService.test.ts`: Configuration loading/saving, fuel calculations, route matching, fuzzy location matching
- `api.test.ts`: API client methods, error handling, request/response formatting

**Components:**
- `Login.test.tsx`: Login form rendering, user interaction, form submission
- `components.test.tsx`: Pagination, sorting, filtering, selection functionality

#### Integration Tests

- `workflows.test.ts`: Complete workflows including:
  - DO creation and linked fuel record creation
  - EXPORT DO linking to existing fuel records
  - Cascade updates on DO changes
  - Cancellation flows
  - LPO auto-fill from DO/fuel record data
  - User role and permission checks
  - Data validation

---

## Key Test Scenarios

### 1. Delivery Order Lifecycle
- Create IMPORT DO → Auto-create fuel record
- Create EXPORT DO → Link to existing fuel record as return journey
- Update DO → Cascade changes to linked fuel record
- Cancel DO → Handle fuel record accordingly

### 2. Fuel Record Management
- Calculate total liters by destination
- Allocate fuel at checkpoints (DAR Yard, Mbeya, Zambia, Congo)
- Track return journey fuel
- Handle open journey detection

### 3. Authentication & Authorization
- User login with valid/invalid credentials
- Token generation and refresh
- Role-based access control
- Driver login with truck number

### 4. Fuel Calculations
- Extra fuel by truck batch (100L, 80L, 60L)
- Loading point extra fuel (Kamoa: 40L, NMI: 20L, Kalongwe: 60L)
- Destination extra fuel (Moshi: 170L)
- Route-based total liters (Lubumbashi: 2100L, Kolwezi: 2400L, etc.)

---

## Running Specific Tests

### Backend
```bash
# Run specific test file
npx jest src/__tests__/unit/models/User.test.ts

# Run tests matching pattern
npx jest --testNamePattern="should create a valid user"
```

### Frontend
```bash
# Run specific test file
npx vitest src/tests/unit/fuelConfigService.test.ts

# Run tests matching pattern
npx vitest --testNamePattern="should return 100L"
```

---

## Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Models | 90%+ |
| Controllers | 80%+ |
| Services | 85%+ |
| Utilities | 95%+ |
| Middleware | 90%+ |
| Components | 70%+ |

---

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Descriptive Names**: Test names should clearly describe the expected behavior
3. **AAA Pattern**: Arrange, Act, Assert structure for each test
4. **Mock External Dependencies**: Use mocks for API calls, localStorage, etc.
5. **Test Edge Cases**: Include tests for boundary conditions and error states
6. **Cleanup**: Reset state between tests using beforeEach/afterEach

---

## Troubleshooting

### MongoDB Memory Server Issues
```bash
# Clear cache if memory server fails
rm -rf node_modules/.cache/mongodb-memory-server
```

### React Testing Library Issues
```bash
# Ensure jsdom is properly configured
npm install --save-dev jsdom
```

### Test Timeout Issues
```javascript
// Increase timeout in jest.config.js or vitest.config.ts
testTimeout: 30000
```
