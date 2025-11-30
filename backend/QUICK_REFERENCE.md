# 🚀 Quick Reference Card

## Server Commands
```bash
npm run dev      # Development mode with auto-reload
npm run build    # Build for production
npm start        # Run production build
npm run lint     # Check code quality
```

## Base URL
```
Development: http://localhost:5000/api
```

## Authentication Header
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Quick API Examples

### 1. Register User
```bash
POST /api/auth/register
{
  "username": "admin",
  "email": "admin@fuel.com",
  "password": "admin123",
  "firstName": "Admin",
  "lastName": "User",
  "role": "super_admin"
}
```

### 2. Login
```bash
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}
# Returns: { accessToken, refreshToken, user }
```

### 3. Create Delivery Order
```bash
POST /api/delivery-orders
Headers: Authorization: Bearer TOKEN
{
  "sn": 1,
  "date": "2024-01-15",
  "importOrExport": "IMPORT",
  "doType": "DO",
  "doNumber": "6343",
  "clientName": "POSEIDON",
  "truckNo": "T844 EKS",
  "trailerNo": "T629 ELE",
  "containerNo": "LOOSE",
  "loadingPoint": "DAR",
  "destination": "KOLWEZI",
  "haulier": "ABC",
  "tonnages": 32,
  "ratePerTon": 180
}
```

### 4. Create Fuel Record
```bash
POST /api/fuel-records
Headers: Authorization: Bearer TOKEN
{
  "date": "2024-01-15",
  "truckNo": "T844 EKS",
  "goingDo": "6343",
  "start": "DAR",
  "from": "DAR",
  "to": "KOLWEZI",
  "totalLts": 2200,
  "darYard": 2000,
  "balance": 200
}
```

### 5. Get Dashboard Stats
```bash
GET /api/dashboard/stats
Headers: Authorization: Bearer TOKEN
```

## Common Query Parameters
```
?page=1              # Page number
&limit=10            # Items per page
&sort=createdAt      # Sort field
&order=desc          # asc or desc
&dateFrom=2024-01-01 # Filter start date
&dateTo=2024-12-31   # Filter end date
```

## User Roles
- `super_admin` - Full access
- `admin` - Admin operations
- `manager` - Management
- `fuel_order_maker` - Create orders
- `clerk` - Data entry
- `yard_personnel` - Yard ops
- `driver` - Driver portal
- `viewer` - Read only

## Response Format
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

## Error Format
```json
{
  "success": false,
  "message": "Error message",
  "errors": [...]
}
```

## File Structure
```
src/
├── config/      # Database & env config
├── models/      # Mongoose schemas
├── controllers/ # Business logic
├── routes/      # API endpoints
├── middleware/  # Auth, validation, errors
├── utils/       # Helper functions
├── types/       # TypeScript types
└── server.ts    # Entry point
```

## Important Files
- `.env` - Environment variables (UPDATE THIS!)
- `SETUP_GUIDE.md` - Complete setup
- `API_TESTING.md` - Test examples
- `logs/app.log` - Application logs

## MongoDB Atlas Setup
1. Create account at mongodb.com
2. Create free cluster (M0)
3. Add database user
4. Whitelist IP (0.0.0.0/0 for dev)
5. Get connection string
6. Update MONGODB_URI in .env

## Health Checks
```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/dashboard/health
```

## Logs Location
```bash
tail -f logs/app.log      # All logs
tail -f logs/error.log    # Errors only
```

## Quick Troubleshooting
1. **Can't connect to DB**: Check MongoDB Atlas connection string
2. **401 Unauthorized**: Token expired, login again
3. **Port in use**: Change PORT in .env
4. **Module not found**: Run npm install

## Production Checklist
- [ ] Change JWT secrets in .env
- [ ] Set NODE_ENV=production
- [ ] Update CORS_ORIGIN to frontend URL
- [ ] Use production MongoDB cluster
- [ ] Enable MongoDB backups
- [ ] Set up SSL/HTTPS
- [ ] Configure firewall
- [ ] Set up monitoring
- [ ] Create admin users
- [ ] Test all endpoints

## Next Steps
1. ✅ Backend complete
2. Configure MongoDB Atlas
3. Test with curl/Postman
4. Connect frontend
5. Import existing data
6. Deploy to production

---
For detailed information, see SETUP_GUIDE.md
