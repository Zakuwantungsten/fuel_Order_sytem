# API Testing Guide

## Setup

1. Make sure MongoDB Atlas is configured in `.env`
2. Install dependencies: `npm install`
3. Start the server: `npm run dev`

## Testing Endpoints with curl or Postman

### 1. Register a User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@fuelorder.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Save the `accessToken` from the response for subsequent requests.

### 3. Create a Delivery Order

```bash
curl -X POST http://localhost:5000/api/delivery-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "sn": 1,
    "date": "2024-01-15",
    "importOrExport": "IMPORT",
    "doType": "DO",
    "doNumber": "6343",
    "clientName": "POSEIDON",
    "truckNo": "T844 EKS",
    "trailerNo": "T629 ELE",
    "containerNo": "LOOSE CARGO",
    "loadingPoint": "DAR",
    "destination": "CCR KOLWEZI",
    "haulier": "ABC Transport",
    "tonnages": 32,
    "ratePerTon": 180
  }'
```

### 4. Get All Delivery Orders

```bash
curl -X GET "http://localhost:5000/api/delivery-orders?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Create a Fuel Record

```bash
curl -X POST http://localhost:5000/api/fuel-records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "date": "2024-01-15",
    "month": "January",
    "truckNo": "T844 EKS",
    "goingDo": "6343",
    "start": "DAR",
    "from": "DAR",
    "to": "KOLWEZI",
    "totalLts": 2200,
    "extra": 200,
    "darYard": 2000,
    "balance": 0
  }'
```

### 6. Create an LPO Entry

```bash
curl -X POST http://localhost:5000/api/lpo-entries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "sn": 1,
    "date": "1-Nov",
    "lpoNo": "2444",
    "dieselAt": "LAKE CHILABOMBWE",
    "doSdo": "6343",
    "truckNo": "T844 EKS",
    "ltrs": 40,
    "pricePerLtr": 1.2,
    "destinations": "Dar"
  }'
```

### 7. Create an LPO Document

```bash
curl -X POST http://localhost:5000/api/lpo-documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "lpoNo": "2444",
    "date": "1-Nov",
    "station": "CASH",
    "orderOf": "TAHMEED",
    "entries": [
      {
        "doNo": "6343",
        "truckNo": "T844 EKS",
        "liters": 40,
        "rate": 1.2,
        "amount": 48,
        "dest": "DAR"
      }
    ],
    "total": 48
  }'
```

### 8. Create a Yard Fuel Dispense

```bash
curl -X POST http://localhost:5000/api/yard-fuel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "date": "2024-01-15",
    "truckNo": "T844 EKS",
    "liters": 2000,
    "yard": "DAR YARD",
    "enteredBy": "admin",
    "notes": "Full tank for Kolwezi trip"
  }'
```

### 9. Get Dashboard Stats

```bash
curl -X GET http://localhost:5000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 10. Get Monthly Fuel Summary

```bash
curl -X GET "http://localhost:5000/api/fuel-records/monthly-summary?month=January" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Testing with Postman

1. Import the collection by creating requests for each endpoint
2. Set up an environment variable for `BASE_URL` = `http://localhost:5000/api`
3. Set up an environment variable for `ACCESS_TOKEN` after login
4. Use `{{BASE_URL}}` and `{{ACCESS_TOKEN}}` in requests

## Response Formats

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "errors": [ ... ] // Optional validation errors
}
```

### Paginated Response
```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": {
    "data": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10
    }
  }
}
```

## Common Query Parameters

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)
- `sort` - Field to sort by (default: createdAt)
- `order` - Sort order: asc or desc (default: desc)
- `dateFrom` - Filter by start date
- `dateTo` - Filter by end date

## Authentication

All protected routes require the `Authorization` header:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Tokens expire after 24 hours (configurable in .env).
Use the refresh token endpoint to get a new access token without logging in again.
