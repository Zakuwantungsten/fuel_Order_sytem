# Fuel Order Backend - Complete Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ installed
- MongoDB Atlas account (free tier works)
- Git installed
- VS Code or your preferred editor

### Step 1: MongoDB Atlas Setup

1. **Create a MongoDB Atlas Account**
   - Go to https://www.mongodb.com/cloud/atlas
   - Sign up for a free account

2. **Create a New Cluster**
   - Click "Build a Database"
   - Choose FREE tier (M0)
   - Select a cloud provider and region (closest to you)
   - Click "Create Cluster"

3. **Set Up Database Access**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Create username and password (SAVE THESE!)
   - Set privileges to "Read and write to any database"
   - Click "Add User"

4. **Set Up Network Access**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
   - For production: Add your server's specific IP address
   - Click "Confirm"

5. **Get Your Connection String**
   - Go to "Database" in the left sidebar
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - It looks like: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

### Step 2: Backend Configuration

1. **Navigate to backend directory**
   ```bash
   cd /home/zakuwantungsten/Desktop/Fuel_Order/backend
   ```

2. **Install dependencies** (already done)
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   - Edit the `.env` file
   - Update `MONGODB_URI` with your connection string from Step 1.5
   - Replace `<username>` with your database username
   - Replace `<password>` with your database password
   - Add `/fuel_order` before the `?` to specify the database name
   
   Example:
   ```
   MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/fuel_order?retryWrites=true&w=majority
   ```

4. **Generate Secure JWT Secrets** (IMPORTANT!)
   ```bash
   # On Linux/Mac:
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   
   # Run twice to get two different secrets
   ```
   
   Update these in `.env`:
   ```
   JWT_SECRET=your_generated_secret_1
   JWT_REFRESH_SECRET=your_generated_secret_2
   ```

### Step 3: Start the Server

**Development Mode:**
```bash
npm run dev
```

The server will start on http://localhost:5000

**Production Build:**
```bash
npm run build
npm start
```

### Step 4: Test the API

1. **Check Health**
   ```bash
   curl http://localhost:5000/health
   ```

2. **Register First User**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "username": "admin",
       "email": "admin@fuelorder.com",
       "password": "admin123",
       "firstName": "System",
       "lastName": "Administrator",
       "role": "super_admin"
     }'
   ```

3. **Login**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "admin",
       "password": "admin123"
     }'
   ```

Save the `accessToken` from the response!

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── index.ts      # Environment config
│   │   └── database.ts   # MongoDB connection
│   ├── models/           # Mongoose schemas
│   │   ├── User.ts
│   │   ├── DeliveryOrder.ts
│   │   ├── LPOEntry.ts
│   │   ├── LPOSummary.ts
│   │   ├── FuelRecord.ts
│   │   └── YardFuelDispense.ts
│   ├── controllers/      # Route handlers
│   │   ├── authController.ts
│   │   ├── deliveryOrderController.ts
│   │   ├── lpoEntryController.ts
│   │   ├── lpoSummaryController.ts
│   │   ├── fuelRecordController.ts
│   │   ├── yardFuelController.ts
│   │   └── dashboardController.ts
│   ├── routes/           # API routes
│   │   ├── authRoutes.ts
│   │   ├── deliveryOrderRoutes.ts
│   │   ├── lpoEntryRoutes.ts
│   │   ├── lpoSummaryRoutes.ts
│   │   ├── fuelRecordRoutes.ts
│   │   ├── yardFuelRoutes.ts
│   │   ├── dashboardRoutes.ts
│   │   └── index.ts
│   ├── middleware/       # Custom middleware
│   │   ├── auth.ts       # JWT authentication
│   │   ├── errorHandler.ts
│   │   └── validation.ts
│   ├── utils/            # Helper functions
│   │   ├── jwt.ts
│   │   ├── logger.ts
│   │   ├── pagination.ts
│   │   └── validate.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   └── server.ts         # Entry point
├── logs/                 # Application logs (auto-created)
├── .env                  # Environment variables
├── .env.example          # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── nodemon.json
├── README.md
└── API_TESTING.md
```

## 🔐 Security Features

✅ **Implemented:**
- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Role-based access control (RBAC)
- Rate limiting (100 requests per 15 minutes)
- CORS protection
- Helmet security headers
- Input validation and sanitization
- Soft delete (data retention)
- Request logging
- Error handling

## 📊 Database Models

1. **User** - Authentication and user management
2. **DeliveryOrder** - Delivery orders (DO/SDO)
3. **LPOEntry** - LPO summary entries
4. **LPOSummary** - Complete LPO documents
5. **FuelRecord** - Fuel allocation records
6. **YardFuelDispense** - Yard fuel dispensing tracking

## 🔑 User Roles

- `super_admin` - Full system access
- `admin` - Administrative access
- `manager` - Management operations
- `supervisor` - Supervisory access
- `clerk` - Data entry
- `driver` - Driver portal access
- `viewer` - Read-only access
- `fuel_order_maker` - Create fuel orders
- `boss` - Executive overview
- `yard_personnel` - Yard operations
- `fuel_attendant` - Fuel dispensing
- `station_manager` - Station management
- `payment_manager` - Payment operations

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password

### Delivery Orders
- `GET /api/delivery-orders` - Get all with pagination
- `GET /api/delivery-orders/:id` - Get by ID
- `GET /api/delivery-orders/truck/:truckNo` - Get by truck
- `GET /api/delivery-orders/next-do-number` - Get next DO number
- `POST /api/delivery-orders` - Create new
- `PUT /api/delivery-orders/:id` - Update
- `DELETE /api/delivery-orders/:id` - Soft delete

### LPO Entries
- `GET /api/lpo-entries` - Get all with pagination
- `GET /api/lpo-entries/:id` - Get by ID
- `GET /api/lpo-entries/lpo/:lpoNo` - Get by LPO number
- `GET /api/lpo-entries/next-lpo-number` - Get next LPO number
- `POST /api/lpo-entries` - Create new
- `PUT /api/lpo-entries/:id` - Update
- `DELETE /api/lpo-entries/:id` - Soft delete

### LPO Documents
- `GET /api/lpo-documents` - Get all with pagination
- `GET /api/lpo-documents/:id` - Get by ID
- `GET /api/lpo-documents/lpo/:lpoNo` - Get by LPO number
- `POST /api/lpo-documents` - Create new
- `PUT /api/lpo-documents/:id` - Update
- `DELETE /api/lpo-documents/:id` - Soft delete

### Fuel Records
- `GET /api/fuel-records` - Get all with pagination
- `GET /api/fuel-records/:id` - Get by ID
- `GET /api/fuel-records/truck/:truckNo` - Get by truck
- `GET /api/fuel-records/do/:doNumber` - Get by DO number
- `GET /api/fuel-records/monthly-summary` - Monthly summary
- `POST /api/fuel-records` - Create new
- `PUT /api/fuel-records/:id` - Update
- `DELETE /api/fuel-records/:id` - Soft delete

### Yard Fuel
- `GET /api/yard-fuel` - Get all with pagination
- `GET /api/yard-fuel/:id` - Get by ID
- `GET /api/yard-fuel/truck/:truckNo` - Get by truck
- `GET /api/yard-fuel/pending` - Get pending dispenses
- `GET /api/yard-fuel/summary` - Get summary
- `POST /api/yard-fuel` - Create new
- `PUT /api/yard-fuel/:id` - Update
- `DELETE /api/yard-fuel/:id` - Soft delete

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/monthly-stats` - Get monthly stats
- `GET /api/dashboard/health` - Health check

## 🔧 Common Query Parameters

- `page` - Page number (default: 1)
- `limit` - Items per page (1-100, default: 10)
- `sort` - Field to sort by (default: createdAt)
- `order` - Sort order: asc/desc (default: desc)
- `dateFrom` - Filter start date
- `dateTo` - Filter end date
- Additional filters vary by endpoint

## 🐛 Debugging

**Check logs:**
```bash
tail -f logs/app.log
tail -f logs/error.log
```

**Common issues:**

1. **Can't connect to MongoDB**
   - Check your connection string in `.env`
   - Verify IP whitelist in MongoDB Atlas
   - Check username/password are correct

2. **Port already in use**
   - Change PORT in `.env` file
   - Or kill the process: `lsof -ti:5000 | xargs kill`

3. **Module not found**
   - Run `npm install` again
   - Delete `node_modules` and run `npm install`

## 🚀 Deployment

### Environment Variables for Production

Update `.env` for production:
```
NODE_ENV=production
PORT=5000
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=very_long_random_production_secret
JWT_REFRESH_SECRET=another_long_random_production_secret
CORS_ORIGIN=https://your-frontend-domain.com
LOG_LEVEL=warn
```

### Deploy to VPS/Cloud

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Use PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name fuel-order-api
   pm2 startup
   pm2 save
   ```

3. **Set up Nginx as reverse proxy** (optional)

## 📝 Next Steps

1. ✅ Backend API is complete and running
2. 🔄 Connect your frontend to `http://localhost:5000/api`
3. 🧪 Test all endpoints using API_TESTING.md
4. 📱 Update frontend `api.ts` to use real API instead of mock data
5. 🔐 Create initial users with appropriate roles
6. 📊 Import existing data from CSV files

## 💡 Tips

- Use Postman or Thunder Client VS Code extension for API testing
- Monitor logs in development: `npm run dev`
- Create a backup admin user immediately
- Review and customize user roles as needed
- Set up automated database backups in MongoDB Atlas

## 📞 Support

For issues or questions about the backend implementation, check:
- README.md - Overview and quick start
- API_TESTING.md - Detailed API testing guide
- Application logs in `logs/` directory
