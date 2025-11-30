# Frontend Integration Guide

## Step 1: Update API Service Configuration

Edit `frontend/src/services/api.ts`:

```typescript
// Change these two lines:
const API_BASE_URL = 'http://localhost:5000/api';  // Update base URL
const USE_MOCK_DATA = false;  // Disable mock data

// Remove mock data imports if you want (optional)
// import { mockAPI } from './mockData';
```

## Step 2: Update CORS in Backend

The backend is already configured to accept requests from your frontend at `http://localhost:5173`.

If your frontend runs on a different port, update `backend/.env`:
```
CORS_ORIGIN=http://localhost:YOUR_PORT
```

## Step 3: Start Both Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Step 4: Create Initial Admin User

Before using the frontend, create an admin user:

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

## Step 5: Login to Frontend

1. Open http://localhost:5173
2. Login with:
   - Username: `admin`
   - Password: `admin123`

## Step 6: Verify API Connection

Check browser console for API calls. You should see requests to `http://localhost:5000/api`.

## API Integration Checklist

### Authentication APIs ✅
- [x] Login - `POST /api/auth/login`
- [x] Register - `POST /api/auth/register`
- [x] Logout - `POST /api/auth/logout`
- [x] Get Profile - `GET /api/auth/me`
- [x] Refresh Token - `POST /api/auth/refresh`

### Delivery Orders APIs ✅
- [x] Get All - `GET /api/delivery-orders`
- [x] Get By ID - `GET /api/delivery-orders/:id`
- [x] Create - `POST /api/delivery-orders`
- [x] Update - `PUT /api/delivery-orders/:id`
- [x] Delete - `DELETE /api/delivery-orders/:id`
- [x] Get By Truck - `GET /api/delivery-orders/truck/:truckNo`

### LPO APIs ✅
- [x] Get All Entries - `GET /api/lpo-entries`
- [x] Get All Documents - `GET /api/lpo-documents`
- [x] Create Entry - `POST /api/lpo-entries`
- [x] Create Document - `POST /api/lpo-documents`
- [x] Get Next LPO Number - `GET /api/lpo-entries/next-lpo-number`

### Fuel Records APIs ✅
- [x] Get All - `GET /api/fuel-records`
- [x] Get By ID - `GET /api/fuel-records/:id`
- [x] Create - `POST /api/fuel-records`
- [x] Update - `PUT /api/fuel-records/:id`
- [x] Get By Truck - `GET /api/fuel-records/truck/:truckNo`
- [x] Monthly Summary - `GET /api/fuel-records/monthly-summary`

### Yard Fuel APIs ✅
- [x] Get All - `GET /api/yard-fuel`
- [x] Create - `POST /api/yard-fuel`
- [x] Get Pending - `GET /api/yard-fuel/pending`
- [x] Get Summary - `GET /api/yard-fuel/summary`

### Dashboard APIs ✅
- [x] Get Stats - `GET /api/dashboard/stats`
- [x] Monthly Stats - `GET /api/dashboard/monthly-stats`

## Example: Update Delivery Orders Page

Your existing code should work! The API endpoints match what's expected:

```typescript
// frontend/src/services/api.ts
export const deliveryOrdersAPI = {
  getAll: async (filters?: any): Promise<DeliveryOrder[]> => {
    // This will now hit http://localhost:5000/api/delivery-orders
    const response = await apiClient.get('/delivery-orders', { params: filters });
    return response.data;
  },
  // ... other methods work automatically
};
```

## Handling Pagination

The backend returns paginated responses. Update your frontend to handle this:

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Update your API calls:
const response = await apiClient.get('/delivery-orders?page=1&limit=10');
const { data, pagination } = response.data.data;
```

## Error Handling

Backend returns consistent error format:

```typescript
try {
  const response = await apiClient.post('/delivery-orders', data);
} catch (error) {
  if (error.response) {
    // Backend returned error
    const { message, errors } = error.response.data;
    console.error(message);
    if (errors) {
      // Validation errors
      errors.forEach(err => console.error(err.field, err.message));
    }
  }
}
```

## Token Management

The backend handles token refresh automatically via the interceptor already in your code:

```typescript
// This is already in frontend/src/services/api.ts
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fuel_order_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }
);
```

## Authentication Context Updates

Update `frontend/src/contexts/AuthContext.tsx` if needed:

```typescript
// Make sure login saves the token
const login = async (credentials: LoginCredentials) => {
  try {
    const response = await authAPI.login(credentials);
    const { user, accessToken } = response.data;
    
    // Save token
    localStorage.setItem('fuel_order_token', accessToken);
    
    // Update state
    setUser(user);
    setIsAuthenticated(true);
  } catch (error) {
    // Handle error
  }
};
```

## Testing Integration

1. **Test Login:**
   - Open frontend
   - Login with admin credentials
   - Check browser Network tab for API call
   - Verify token is saved in localStorage

2. **Test CRUD Operations:**
   - Create a Delivery Order
   - View list of orders
   - Edit an order
   - Delete an order

3. **Test Fuel Records:**
   - Create a DO (IMPORT)
   - System should auto-create fuel record
   - Verify in Fuel Records page

4. **Test LPO Generation:**
   - Create LPOs from fuel allocations
   - Verify LPO numbers increment

## Data Format Notes

The backend uses the same data structures as your frontend:

- **Dates:** Store as strings (e.g., "2024-01-15" or "1-Nov")
- **Numbers:** Store as numbers (not strings)
- **IDs:** MongoDB uses `_id` (not `id`)

Your frontend types already match! Just ensure:

```typescript
// Backend returns _id, but your interface uses id?
// The backend automatically converts _id to id in responses
// So your existing code should work!
```

## Common Issues & Solutions

### Issue 1: CORS Error
```
Access to XMLHttpRequest blocked by CORS policy
```
**Solution:** Make sure backend CORS_ORIGIN in .env matches your frontend URL

### Issue 2: 401 Unauthorized
```
Authentication required
```
**Solution:** Token expired or not sent. Login again.

### Issue 3: Connection Refused
```
Failed to connect to localhost:5000
```
**Solution:** Backend server not running. Run `npm run dev` in backend folder.

### Issue 4: Empty Response
```
Data is undefined
```
**Solution:** Check response structure. Backend wraps data in `response.data.data`.

## Performance Tips

1. **Enable Response Caching** (optional):
```typescript
// Cache GET requests for 5 minutes
const cache = new Map();
```

2. **Implement Debouncing** for search:
```typescript
const debouncedSearch = debounce((query) => {
  fetchData(query);
}, 300);
```

3. **Use Pagination** properly:
```typescript
// Load more data as user scrolls
const loadMore = async () => {
  const nextPage = currentPage + 1;
  const response = await deliveryOrdersAPI.getAll({ page: nextPage });
  setData([...data, ...response.data]);
};
```

## Next Steps

1. ✅ Update `api.ts` configuration
2. ✅ Start both servers
3. ✅ Create admin user
4. ✅ Test login
5. ✅ Test CRUD operations
6. 🔄 Import existing data from CSV files
7. 🔄 Customize UI based on user roles
8. 🔄 Add real-time features (optional)
9. 🔄 Deploy to production

## Production Deployment

When deploying to production:

1. **Update Frontend API URL:**
```typescript
const API_BASE_URL = 'https://api.yourfomain.com/api';
```

2. **Update Backend CORS:**
```
CORS_ORIGIN=https://yourfrontend.com
```

3. **Enable HTTPS** on both frontend and backend

4. **Set Production Environment:**
```
NODE_ENV=production
```

## Support

If you encounter issues:
1. Check browser console for errors
2. Check backend logs: `tail -f backend/logs/app.log`
3. Verify both servers are running
4. Check network tab in browser DevTools
5. Verify MongoDB connection in backend

---

Your backend is production-ready! Just configure MongoDB Atlas and start testing. 🚀
