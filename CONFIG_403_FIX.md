# 403 Forbidden Error Fix - Config API Access

## Issue
When non-admin users (managers, yard personnel, drivers) tried to create LPOs, they received a **403 Forbidden** error when the frontend attempted to fetch stations from `/api/system-admin/config/stations`.

### Error Details
```
GET http://localhost:5000/api/system-admin/config/stations 403 (Forbidden)
```

## Root Cause
The `/api/system-admin/config/*` endpoints required `system_admin` or `super_admin` role via the `authorize()` middleware. However, **all authenticated users** need read-only access to stations and routes when creating LPOs, DOs, and other documents.

## Solution
Created a **public read-only config API** at `/api/config/*` that requires only authentication (not admin authorization).

### Changes Made

#### 1. New Route File: `backend/src/routes/publicConfigRoutes.ts`
```typescript
import express from 'express';
import { authenticate } from '../middleware/auth';
import * as configController from '../controllers/configController';

const router = express.Router();

// Public read-only config routes - require authentication but not admin role
// These are used by all authenticated users when creating LPOs, DOs, etc.

router.use(authenticate); // Only require authentication, not authorization

// Fuel station routes (read-only)
router.get('/stations', configController.getFuelStations);

// Route configuration routes (read-only)
router.get('/routes', configController.getRoutes);
router.get('/routes/find/:destination', configController.findRouteByDestination);

// Formula helpers
router.get('/formula-variables', configController.getFormulaVariables);

export default router;
```

**Key Point**: Uses `authenticate` only (not `authorize`), so all authenticated users can access.

#### 2. Updated `backend/src/routes/index.ts`
```typescript
import publicConfigRoutes from './publicConfigRoutes';

// Mount routes
router.use('/auth', authRoutes);
router.use('/config', publicConfigRoutes); // Public read-only config for all authenticated users
router.use('/delivery-orders', deliveryOrderRoutes);
// ... rest of routes
```

#### 3. Updated `frontend/src/services/api.ts`
Changed GET requests to use new public endpoint:

```typescript
// OLD: /system-admin/config/stations (403 for non-admins)
// NEW: /config/stations (accessible to all authenticated users)

export const configAPI = {
  // Fuel Stations (public read-only endpoint for all authenticated users)
  getStations: async () => {
    const response = await apiClient.get('/config/stations'); // Changed
    return response.data.data;
  },
  
  // Routes (public read-only endpoint for all authenticated users)
  getRoutes: async () => {
    const response = await apiClient.get('/config/routes'); // Changed
    return response.data.data;
  },
  
  // Formula helpers (public read-only endpoint)
  getFormulaVariables: async () => {
    const response = await apiClient.get('/config/formula-variables'); // Changed
    return response.data;
  },
  
  // Write operations still use admin endpoints
  createStation: async (data) => {
    const response = await apiClient.post('/system-admin/config/stations', data);
    return response.data;
  },
  // ... other admin-only operations
};
```

## API Endpoints Summary

### Public Endpoints (All Authenticated Users)
- `GET /api/config/stations` - Read fuel stations
- `GET /api/config/routes` - Read routes
- `GET /api/config/routes/find/:destination` - Find route by destination
- `GET /api/config/formula-variables` - Get available formula variables

### Admin-Only Endpoints (Super Admin / System Admin)
- `POST /api/system-admin/config/stations` - Create station
- `PUT /api/system-admin/config/stations/:id` - Update station
- `DELETE /api/system-admin/config/stations/:id` - Delete station
- `POST /api/system-admin/config/routes` - Create route
- `PUT /api/system-admin/config/routes/:id` - Update route
- `DELETE /api/system-admin/config/routes/:id` - Delete route

## Security Model

### Before (Broken)
```
User (Manager) → Create LPO → Need stations → GET /system-admin/config/stations → 403 ❌
```

### After (Fixed)
```
User (Manager) → Create LPO → Need stations → GET /config/stations → 200 ✅
Super Admin → Edit station → PUT /system-admin/config/stations/:id → 200 ✅
```

## Testing

### Test as Manager/Non-Admin User
1. Login as manager
2. Create new LPO
3. Station dropdown should load without errors
4. No 403 errors in console

### Test as Super Admin
1. Login as super admin
2. Go to Configuration tab
3. Should be able to create/edit/delete stations and routes
4. Changes should reflect in LPO modals immediately (after cache expiry)

## Files Modified
1. ✅ `backend/src/routes/publicConfigRoutes.ts` - **Created**
2. ✅ `backend/src/routes/index.ts` - Added public config routes
3. ✅ `frontend/src/services/api.ts` - Updated endpoints for read operations

## Backward Compatibility
✅ No breaking changes
✅ Admin endpoints unchanged
✅ Existing components continue to work
✅ Controllers reused (no duplication)

## Next Steps
1. Restart backend server to load new routes
2. Test LPO creation as manager
3. Verify no 403 errors in browser console
4. Test station management as super admin

## Related Files
- `backend/src/controllers/configController.ts` - Reused existing controllers
- `backend/src/middleware/auth.ts` - `authenticate` vs `authorize`
- `frontend/src/services/configService.ts` - Uses configAPI.getStations()
- `frontend/src/components/LPODetailForm.tsx` - Calls configService
- `frontend/src/components/DriverAccountWorkbook.tsx` - Calls configService

## Security Notes
- ✅ Read-only access for non-admins is safe
- ✅ Write operations still require admin privileges
- ✅ Authentication still required (not publicly accessible)
- ✅ Follows principle of least privilege
