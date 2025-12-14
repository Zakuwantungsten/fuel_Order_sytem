# Truck Batch Flexibility - Comprehensive Analysis Report

**Date**: December 14, 2025  
**Requested Feature**: Allow admin to create custom batches with any extra fuel allocation, not just 100L, 80L, and 60L

---

## Executive Summary

The current system **HARDCODES** three fixed batch sizes (100L, 80L, 60L) throughout the entire codebase - from database schema to frontend UI to backend validation. Implementing custom batch creation requires **significant architectural changes** across multiple layers.

### Current System Architecture

```
┌─────────────────────────────────────────────────────────┐
│          HARDCODED: batch_100, batch_80, batch_60       │
├─────────────────────────────────────────────────────────┤
│  Database Schema (MongoDB)                              │
│  ├─ SystemConfig.truckBatches.batch_100: ITruckBatch[] │
│  ├─ SystemConfig.truckBatches.batch_80: ITruckBatch[]  │
│  └─ SystemConfig.truckBatches.batch_60: ITruckBatch[]  │
├─────────────────────────────────────────────────────────┤
│  Backend Validation                                     │
│  └─ extraLiters: .isIn([60, 80, 100])                  │
├─────────────────────────────────────────────────────────┤
│  Backend Logic                                          │
│  └─ if/else for batch_100, batch_80, batch_60          │
├─────────────────────────────────────────────────────────┤
│  Frontend TypeScript Types                             │
│  └─ batch: 100 | 80 | 60 (union type)                  │
├─────────────────────────────────────────────────────────┤
│  Frontend UI                                            │
│  └─ 3 hardcoded batch cards                            │
└─────────────────────────────────────────────────────────┘
```

---

## Current Implementation Deep Dive

### 1. **Database Schema** (MongoDB)
**File**: `backend/src/models/SystemConfig.ts`

```typescript
// CURRENT: Fixed structure
truckBatches?: {
  batch_100: ITruckBatch[];  // Hardcoded
  batch_80: ITruckBatch[];   // Hardcoded
  batch_60: ITruckBatch[];   // Hardcoded
}

// ITruckBatch schema
export interface ITruckBatch {
  truckSuffix: string;
  extraLiters: number; // Validated: enum: [60, 80, 100]
  destinationRules?: IDestinationFuelRule[];
  truckNumber?: string;
  addedBy: string;
  addedAt: Date;
}

// Schema validation ENFORCES the enum
const truckBatchSchema = new Schema<ITruckBatch>({
  extraLiters: { 
    type: Number, 
    required: true, 
    enum: [60, 80, 100]  // ❌ HARDCODED VALIDATION
  },
  // ...
});
```

**Problem**: The schema ONLY allows 60, 80, or 100. Any other value will be **rejected by MongoDB**.

---

### 2. **Backend Controller Logic**
**File**: `backend/src/controllers/adminController.ts`

#### Default Batches:
```typescript
const DEFAULT_TRUCK_BATCHES = {
  batch_100: [
    { truckSuffix: 'dnh', extraLiters: 100, addedBy: 'system', addedAt: new Date() },
    // ... 9 trucks
  ],
  batch_80: [
    { truckSuffix: 'dvk', extraLiters: 80, addedBy: 'system', addedAt: new Date() },
    // ... 3 trucks
  ],
  batch_60: [
    { truckSuffix: 'dyy', extraLiters: 60, addedBy: 'system', addedAt: new Date() },
    // ... 16 trucks
  ],
};
```

#### Add Truck Logic (Lines 514-583):
```typescript
export const addTruckToBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { truckSuffix, extraLiters, truckNumber } = req.body;

  // ❌ HARDCODED VALIDATION
  if (![60, 80, 100].includes(extraLiters)) {
    throw new ApiError(400, 'extraLiters must be 60, 80, or 100');
  }

  // ❌ HARDCODED if/else
  if (extraLiters === 100) {
    config.truckBatches.batch_100.push(newTruck);
  } else if (extraLiters === 80) {
    config.truckBatches.batch_80.push(newTruck);
  } else {
    config.truckBatches.batch_60.push(newTruck);
  }
};
```

#### Remove Truck Logic (Lines 585-630):
```typescript
export const removeTruckFromBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  // ❌ HARDCODED array access
  config.truckBatches.batch_100 = config.truckBatches.batch_100.filter(t => t.truckSuffix !== suffix);
  config.truckBatches.batch_80 = config.truckBatches.batch_80.filter(t => t.truckSuffix !== suffix);
  config.truckBatches.batch_60 = config.truckBatches.batch_60.filter(t => t.truckSuffix !== suffix);
};
```

#### Destination Rules Logic (Lines 632-750):
```typescript
export const addDestinationRule = async (req: AuthRequest, res: Response): Promise<void> => {
  // ❌ HARDCODED search across 3 batches
  let truck = config.truckBatches.batch_100.find(t => t.truckSuffix === suffix);
  if (truck) {
    // ...
  } else {
    truck = config.truckBatches.batch_80.find(t => t.truckSuffix === suffix);
    if (truck) {
      // ...
    } else {
      truck = config.truckBatches.batch_60.find(t => t.truckSuffix === suffix);
      // ...
    }
  }
};
```

**Problem**: Every operation is hardcoded for 3 specific batches. No dynamic batch support.

---

### 3. **Backend Routes & Validation**
**File**: `backend/src/routes/adminRoutes.ts`

```typescript
router.post(
  '/truck-batches',
  [
    body('truckSuffix').notEmpty().withMessage('Truck suffix is required'),
    body('extraLiters').isIn([60, 80, 100])  // ❌ HARDCODED VALIDATION
      .withMessage('Extra liters must be 60, 80, or 100'),
    body('truckNumber').optional().isString(),
  ],
  validate,
  asyncHandler(adminController.addTruckToBatch)
);
```

**Problem**: Express validation rejects any value except 60, 80, 100.

---

### 4. **Frontend TypeScript Types**
**File**: `frontend/src/services/api.ts`

```typescript
export interface TruckBatch {
  truckSuffix: string;
  extraLiters: number;  // This is flexible, BUT...
  destinationRules?: {
    destination: string;
    extraLiters: number;
  }[];
  truckNumber?: string;
  addedBy: string;
  addedAt: string;
}

export interface TruckBatches {
  batch_100: TruckBatch[];  // ❌ HARDCODED
  batch_80: TruckBatch[];   // ❌ HARDCODED
  batch_60: TruckBatch[];   // ❌ HARDCODED
}
```

**File**: `frontend/src/pages/TruckBatches.tsx`

```typescript
// ❌ HARDCODED union type
const [newTruck, setNewTruck] = useState({ 
  suffix: '', 
  batch: 60 as 100 | 80 | 60  // Type union
});

// ❌ HARDCODED dropdown
<select
  value={newTruck.batch}
  onChange={(e) => setNewTruck({ 
    ...newTruck, 
    batch: parseInt(e.target.value) as 100 | 80 | 60 
  })}
>
  <option value={100}>100 Liters</option>
  <option value={80}>80 Liters</option>
  <option value={60}>60 Liters</option>
</select>
```

**Problem**: TypeScript enforces only 3 values. Frontend UI hardcoded.

---

### 5. **Frontend UI Components**
**File**: `frontend/src/pages/TruckBatches.tsx`

```tsx
// ❌ HARDCODED stats display
<div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
  <p className="text-sm text-green-700 dark:text-green-400">100L Batch</p>
  <p className="text-2xl font-bold text-green-900 dark:text-green-100">
    {batches.batch_100.length}
  </p>
</div>
<div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
  <p className="text-sm text-yellow-700 dark:text-yellow-400">80L Batch</p>
  <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
    {batches.batch_80.length}
  </p>
</div>
<div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
  <p className="text-sm text-blue-700 dark:text-blue-400">60L Batch</p>
  <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
    {batches.batch_60.length}
  </p>
</div>

// ❌ HARDCODED batch cards
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {renderBatchCard(100, batches.batch_100, 'green')}
  {renderBatchCard(80, batches.batch_80, 'yellow')}
  {renderBatchCard(60, batches.batch_60, 'blue')}
</div>

// ❌ HARDCODED move buttons
{[100, 80, 60].map((size) => {
  if (size === batchSize) return null;
  return (
    <button onClick={() => handleMoveTruck(suffix, size as 100 | 80 | 60)}>
      → {size}L
    </button>
  );
})}
```

**Problem**: UI renders exactly 3 batch cards. No dynamic rendering.

---

### 6. **React Query Hooks**
**File**: `frontend/src/hooks/useTruckBatches.ts`

```typescript
export function getExtraFuelFromBatches(
  truckNo: string,
  batches: TruckBatches | undefined,
  destination?: string
) {
  // ❌ HARDCODED batch checks
  const truck100 = batches.batch_100.find(t => t.truckSuffix === truckSuffix);
  if (truck100) {
    return { extraFuel: 100, matched: true, batchName: 'batch_100', truckSuffix };
  }

  const truck80 = batches.batch_80.find(t => t.truckSuffix === truckSuffix);
  if (truck80) {
    return { extraFuel: 80, matched: true, batchName: 'batch_80', truckSuffix };
  }

  const truck60 = batches.batch_60.find(t => t.truckSuffix === truckSuffix);
  if (truck60) {
    return { extraFuel: 60, matched: true, batchName: 'batch_60', truckSuffix };
  }
}
```

**Problem**: Helper function hardcoded to check 3 specific batches.

---

## Proposed Solution: Dynamic Batch System

### Option A: **Map-Based Dynamic Batches** (Recommended ✅)

#### Database Schema Change:
```typescript
// ❌ OLD: Fixed object structure
truckBatches?: {
  batch_100: ITruckBatch[];
  batch_80: ITruckBatch[];
  batch_60: ITruckBatch[];
}

// ✅ NEW: Dynamic Map<number, ITruckBatch[]>
truckBatches?: Map<number, ITruckBatch[]>; // Key = extraLiters, Value = trucks

// Or in MongoDB (stored as object):
truckBatches?: {
  [extraLiters: number]: ITruckBatch[];
}

// Example data:
{
  "truckBatches": {
    "100": [{ truckSuffix: "dnh", extraLiters: 100, ... }],
    "80": [{ truckSuffix: "dvk", extraLiters: 80, ... }],
    "60": [{ truckSuffix: "dyy", extraLiters: 60, ... }],
    "120": [{ truckSuffix: "abc", extraLiters: 120, ... }],  // NEW!
    "75": [{ truckSuffix: "xyz", extraLiters: 75, ... }]     // NEW!
  }
}
```

#### Backend Schema Update:
```typescript
// backend/src/models/SystemConfig.ts
export interface ISystemConfig {
  configType: '...';
  truckBatches?: {
    [extraLiters: string]: ITruckBatch[];  // Dynamic keys
  };
  // ...
}

const truckBatchSchema = new Schema<ITruckBatch>({
  truckSuffix: { type: String, required: true },
  extraLiters: { 
    type: Number, 
    required: true, 
    min: 0,        // ✅ Allow any positive number
    max: 10000     // Reasonable limit
  },
  // Remove enum: [60, 80, 100]
});

const systemConfigSchema = new Schema<ISystemConfigDocument>({
  // ...
  truckBatches: {
    type: Map,
    of: [truckBatchSchema]  // Dynamic map
  },
});
```

#### Backend Controller Refactor:
```typescript
// backend/src/controllers/adminController.ts

// ✅ NEW: Dynamic batch creation
export const createBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { extraLiters, batchName } = req.body;

  if (!extraLiters || extraLiters < 0) {
    throw new ApiError(400, 'Invalid extraLiters value');
  }

  let config = await SystemConfig.findOne({
    configType: 'truck_batches',
    isDeleted: false,
  });

  if (!config) {
    config = await SystemConfig.create({
      configType: 'truck_batches',
      truckBatches: {},
      lastUpdatedBy: req.user?.username || 'system',
    });
  }

  const batchKey = extraLiters.toString();

  if (config.truckBatches[batchKey]) {
    throw new ApiError(400, `Batch with ${extraLiters}L already exists`);
  }

  config.truckBatches[batchKey] = [];
  config.lastUpdatedBy = req.user?.username || 'system';
  await config.save();

  logger.info(`New batch created: ${extraLiters}L by ${req.user?.username}`);

  res.status(201).json({
    success: true,
    message: 'Batch created successfully',
    data: config.truckBatches,
  });
};

// ✅ NEW: Update batch (rename or change allocation)
export const updateBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { oldExtraLiters, newExtraLiters } = req.body;

  let config = await SystemConfig.findOne({
    configType: 'truck_batches',
    isDeleted: false,
  });

  if (!config || !config.truckBatches) {
    throw new ApiError(404, 'Truck batches configuration not found');
  }

  const oldKey = oldExtraLiters.toString();
  const newKey = newExtraLiters.toString();

  if (!config.truckBatches[oldKey]) {
    throw new ApiError(404, `Batch ${oldExtraLiters}L not found`);
  }

  if (config.truckBatches[newKey]) {
    throw new ApiError(400, `Batch ${newExtraLiters}L already exists`);
  }

  // Move trucks to new batch allocation
  const trucks = config.truckBatches[oldKey];
  trucks.forEach(truck => truck.extraLiters = newExtraLiters);
  config.truckBatches[newKey] = trucks;
  delete config.truckBatches[oldKey];

  config.lastUpdatedBy = req.user?.username || 'system';
  await config.save();

  logger.info(`Batch updated: ${oldExtraLiters}L → ${newExtraLiters}L by ${req.user?.username}`);

  res.status(200).json({
    success: true,
    message: 'Batch updated successfully',
    data: config.truckBatches,
  });
};

// ✅ NEW: Delete batch
export const deleteBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { extraLiters } = req.params;

  let config = await SystemConfig.findOne({
    configType: 'truck_batches',
    isDeleted: false,
  });

  if (!config || !config.truckBatches) {
    throw new ApiError(404, 'Truck batches configuration not found');
  }

  const batchKey = extraLiters.toString();

  if (!config.truckBatches[batchKey]) {
    throw new ApiError(404, `Batch ${extraLiters}L not found`);
  }

  if (config.truckBatches[batchKey].length > 0) {
    throw new ApiError(400, 'Cannot delete batch with trucks assigned. Move trucks first.');
  }

  delete config.truckBatches[batchKey];
  config.lastUpdatedBy = req.user?.username || 'system';
  await config.save();

  logger.info(`Batch deleted: ${extraLiters}L by ${req.user?.username}`);

  res.status(200).json({
    success: true,
    message: 'Batch deleted successfully',
    data: config.truckBatches,
  });
};

// ✅ REFACTORED: Add truck to batch (now dynamic)
export const addTruckToBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { truckSuffix, extraLiters, truckNumber } = req.body;

  if (!truckSuffix || !extraLiters) {
    throw new ApiError(400, 'Missing required fields: truckSuffix, extraLiters');
  }

  // ✅ Remove hardcoded validation
  if (extraLiters < 0 || extraLiters > 10000) {
    throw new ApiError(400, 'extraLiters must be between 0 and 10000');
  }

  let config = await SystemConfig.findOne({
    configType: 'truck_batches',
    isDeleted: false,
  });

  const suffix = truckSuffix.toLowerCase();
  const batchKey = extraLiters.toString();

  // Ensure batch exists
  if (!config.truckBatches[batchKey]) {
    throw new ApiError(404, `Batch ${extraLiters}L does not exist. Create it first.`);
  }

  // Remove from all batches first
  Object.keys(config.truckBatches).forEach(key => {
    config.truckBatches[key] = config.truckBatches[key].filter(t => t.truckSuffix !== suffix);
  });

  // Add to target batch
  const newTruck = {
    truckSuffix: suffix,
    extraLiters,
    truckNumber,
    addedBy: req.user?.username || 'system',
    addedAt: new Date(),
  };

  config.truckBatches[batchKey].push(newTruck);
  config.lastUpdatedBy = req.user?.username || 'system';
  await config.save();

  logger.info(`Truck ${truckSuffix} added to batch ${extraLiters}L by ${req.user?.username}`);

  res.status(201).json({
    success: true,
    message: `Truck added to ${extraLiters}L batch successfully`,
    data: config.truckBatches,
  });
};

// ✅ REFACTORED: Remove truck (now dynamic)
export const removeTruckFromBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { truckSuffix } = req.params;

  let config = await SystemConfig.findOne({
    configType: 'truck_batches',
    isDeleted: false,
  });

  const suffix = truckSuffix.toLowerCase();
  let found = false;

  // Remove from all batches dynamically
  Object.keys(config.truckBatches).forEach(key => {
    const originalLength = config.truckBatches[key].length;
    config.truckBatches[key] = config.truckBatches[key].filter(t => t.truckSuffix !== suffix);
    if (config.truckBatches[key].length < originalLength) {
      found = true;
    }
  });

  if (!found) {
    throw new ApiError(404, 'Truck not found in any batch');
  }

  config.lastUpdatedBy = req.user?.username || 'system';
  await config.save();

  res.status(200).json({
    success: true,
    message: 'Truck removed from batch successfully',
    data: config.truckBatches,
  });
};
```

#### Backend Routes Update:
```typescript
// backend/src/routes/adminRoutes.ts

// ✅ NEW: Batch management routes
router.post(
  '/truck-batches/batches',
  [
    body('extraLiters').isNumeric().isInt({ min: 0, max: 10000 })
      .withMessage('Extra liters must be a number between 0 and 10000'),
    body('batchName').optional().isString(),
  ],
  validate,
  asyncHandler(adminController.createBatch)
);

router.put(
  '/truck-batches/batches',
  [
    body('oldExtraLiters').isNumeric().withMessage('Old extra liters is required'),
    body('newExtraLiters').isNumeric().isInt({ min: 0, max: 10000 })
      .withMessage('New extra liters must be between 0 and 10000'),
  ],
  validate,
  asyncHandler(adminController.updateBatch)
);

router.delete(
  '/truck-batches/batches/:extraLiters',
  [
    param('extraLiters').isNumeric().withMessage('Extra liters is required'),
  ],
  validate,
  asyncHandler(adminController.deleteBatch)
);

// ✅ UPDATED: Remove hardcoded validation
router.post(
  '/truck-batches',
  [
    body('truckSuffix').notEmpty().withMessage('Truck suffix is required'),
    body('extraLiters').isNumeric().isInt({ min: 0, max: 10000 })
      .withMessage('Extra liters must be between 0 and 10000'),
    body('truckNumber').optional().isString(),
  ],
  validate,
  asyncHandler(adminController.addTruckToBatch)
);
```

#### Frontend TypeScript Types Update:
```typescript
// frontend/src/services/api.ts

// ✅ NEW: Dynamic TruckBatches type
export interface TruckBatches {
  [extraLiters: string]: TruckBatch[];  // Dynamic keys!
}

// ✅ NEW: Batch metadata
export interface BatchInfo {
  extraLiters: number;
  truckCount: number;
  trucks: TruckBatch[];
}
```

#### Frontend API Service Update:
```typescript
// frontend/src/services/api.ts

export const adminAPI = {
  // Existing
  getTruckBatches: async (): Promise<TruckBatches> => {
    const response = await apiClient.get<ApiResponse<TruckBatches>>('/admin/truck-batches');
    return response.data.data;
  },

  // ✅ NEW: Create batch
  createBatch: async (data: { extraLiters: number }): Promise<TruckBatches> => {
    const response = await apiClient.post<ApiResponse<TruckBatches>>('/admin/truck-batches/batches', data);
    return response.data.data;
  },

  // ✅ NEW: Update batch
  updateBatch: async (data: { oldExtraLiters: number; newExtraLiters: number }): Promise<TruckBatches> => {
    const response = await apiClient.put<ApiResponse<TruckBatches>>('/admin/truck-batches/batches', data);
    return response.data.data;
  },

  // ✅ NEW: Delete batch
  deleteBatch: async (extraLiters: number): Promise<TruckBatches> => {
    const response = await apiClient.delete<ApiResponse<TruckBatches>>(`/admin/truck-batches/batches/${extraLiters}`);
    return response.data.data;
  },

  // UPDATED: No validation changes needed
  addTruckToBatch: async (data: { truckSuffix: string; extraLiters: number; truckNumber?: string }): Promise<TruckBatches> => {
    const response = await apiClient.post<ApiResponse<TruckBatches>>('/admin/truck-batches', data);
    return response.data.data;
  },
};
```

#### Frontend React Query Hooks Update:
```typescript
// frontend/src/hooks/useTruckBatches.ts

// ✅ NEW: Create batch mutation
export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { extraLiters: number }) => {
      const result = await adminAPI.createBatch(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Batch ${variables.extraLiters}L created`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
  });
}

// ✅ NEW: Update batch mutation
export function useUpdateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { oldExtraLiters: number; newExtraLiters: number }) => {
      const result = await adminAPI.updateBatch(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Batch updated: ${variables.oldExtraLiters}L → ${variables.newExtraLiters}L`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
  });
}

// ✅ NEW: Delete batch mutation
export function useDeleteBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (extraLiters: number) => {
      const result = await adminAPI.deleteBatch(extraLiters);
      return result;
    },
    onSuccess: (_, extraLiters) => {
      console.log(`✓ Batch ${extraLiters}L deleted`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
  });
}

// ✅ REFACTORED: Dynamic helper function
export function getExtraFuelFromBatches(
  truckNo: string,
  batches: TruckBatches | undefined,
  destination?: string
) {
  if (!batches) {
    return { extraFuel: 0, matched: false, truckSuffix: '' };
  }

  const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';

  if (!truckSuffix) {
    return { extraFuel: 0, matched: false, truckSuffix: '' };
  }

  // ✅ Dynamic search across all batches
  for (const [extraLitersStr, trucks] of Object.entries(batches)) {
    const truck = trucks.find(t => t.truckSuffix === truckSuffix);
    if (truck) {
      // Check destination rules
      if (destination && truck.destinationRules && truck.destinationRules.length > 0) {
        const normalizedDest = destination.toLowerCase().trim();
        const matchingRule = truck.destinationRules.find((rule: any) => {
          const ruleDestination = rule.destination.toLowerCase().trim();
          return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
        });

        if (matchingRule) {
          return {
            extraFuel: matchingRule.extraLiters,
            matched: true,
            batchName: `batch_${extraLitersStr}`,
            truckSuffix,
            destinationOverride: true,
          };
        }
      }

      // Return batch default
      return {
        extraFuel: parseInt(extraLitersStr),
        matched: true,
        batchName: `batch_${extraLitersStr}`,
        truckSuffix,
      };
    }
  }

  // Not found
  return { extraFuel: 0, matched: false, truckSuffix };
}
```

#### Frontend UI Component Refactor:
```tsx
// frontend/src/pages/TruckBatches.tsx

export default function TruckBatches() {
  const { data: batches, isLoading: loading } = useTruckBatches();
  const createBatchMutation = useCreateBatch();
  const updateBatchMutation = useUpdateBatch();
  const deleteBatchMutation = useDeleteBatch();
  const addTruckMutation = useAddTruckBatch();
  const removeTruckMutation = useRemoveTruckBatch();

  // ✅ NEW: State for batch management
  const [newBatchLiters, setNewBatchLiters] = useState<number>(0);
  const [showCreateBatchModal, setShowCreateBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<{ old: number; new: number } | null>(null);

  // ✅ NEW: Dynamic batch list
  const batchList = batches
    ? Object.entries(batches).map(([extraLitersStr, trucks]) => ({
        extraLiters: parseInt(extraLitersStr),
        trucks,
        count: trucks.length,
      }))
    : [];

  // Sort by extraLiters descending
  batchList.sort((a, b) => b.extraLiters - a.extraLiters);

  // ✅ NEW: Create batch handler
  const handleCreateBatch = async () => {
    if (newBatchLiters <= 0) {
      alert('Please enter a valid liter amount');
      return;
    }

    try {
      await createBatchMutation.mutateAsync({ extraLiters: newBatchLiters });
      setNewBatchLiters(0);
      setShowCreateBatchModal(false);
      alert(`✓ New batch ${newBatchLiters}L created`);
    } catch (error: any) {
      alert(`Failed to create batch: ${error.response?.data?.error || error.message}`);
    }
  };

  // ✅ NEW: Update batch handler
  const handleUpdateBatch = async (oldLiters: number, newLiters: number) => {
    if (newLiters <= 0) {
      alert('Please enter a valid liter amount');
      return;
    }

    if (!confirm(`Update batch from ${oldLiters}L to ${newLiters}L?`)) return;

    try {
      await updateBatchMutation.mutateAsync({ oldExtraLiters: oldLiters, newExtraLiters: newLiters });
      alert(`✓ Batch updated: ${oldLiters}L → ${newLiters}L`);
    } catch (error: any) {
      alert(`Failed to update batch: ${error.response?.data?.error || error.message}`);
    }
  };

  // ✅ NEW: Delete batch handler
  const handleDeleteBatch = async (extraLiters: number) => {
    const batch = batches?.[extraLiters.toString()];
    if (batch && batch.length > 0) {
      alert(`Cannot delete batch ${extraLiters}L with ${batch.length} trucks assigned. Move trucks first.`);
      return;
    }

    if (!confirm(`Delete batch ${extraLiters}L? This cannot be undone.`)) return;

    try {
      await deleteBatchMutation.mutateAsync(extraLiters);
      alert(`✓ Batch ${extraLiters}L deleted`);
    } catch (error: any) {
      alert(`Failed to delete batch: ${error.response?.data?.error || error.message}`);
    }
  };

  // ✅ UPDATED: Dynamic truck adding
  const [newTruck, setNewTruck] = useState({ suffix: '', batch: 0 });

  const handleAddTruck = async () => {
    const suffix = newTruck.suffix.trim().toLowerCase();
    
    if (!suffix) {
      alert('Please enter a truck suffix (e.g., DNH, EAG)');
      return;
    }

    if (newTruck.batch <= 0) {
      alert('Please select a valid batch');
      return;
    }

    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newTruck.batch,
      });
      setNewTruck({ suffix: '', batch: 0 });
      alert(`✓ Truck ${suffix.toUpperCase()} added to ${newTruck.batch}L batch`);
    } catch (error: any) {
      alert(`Failed to add truck: ${error.message}`);
    }
  };

  // ✅ DYNAMIC: Color assignment based on index
  const getColorForIndex = (index: number) => {
    const colors = ['green', 'yellow', 'blue', 'purple', 'pink', 'indigo', 'red', 'orange'];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Truck Batch Configuration
              </h1>
              <p className="text-sm text-gray-600">
                Create and manage custom fuel allocation batches
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateBatchModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5 inline mr-2" />
            Create New Batch
          </button>
        </div>

        {/* ✅ DYNAMIC: Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total Batches</p>
            <p className="text-2xl font-bold text-gray-900">{batchList.length}</p>
          </div>
          {batchList.slice(0, 3).map((batch, idx) => (
            <div key={batch.extraLiters} className={`bg-${getColorForIndex(idx)}-50 rounded-lg p-4`}>
              <p className={`text-sm text-${getColorForIndex(idx)}-700`}>{batch.extraLiters}L Batch</p>
              <p className={`text-2xl font-bold text-${getColorForIndex(idx)}-900`}>{batch.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Truck */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Add Truck to Batch
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Truck Suffix
            </label>
            <input
              type="text"
              value={newTruck.suffix}
              onChange={(e) => setNewTruck({ ...newTruck, suffix: e.target.value })}
              placeholder="e.g., DNH, EAG, BAB"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Batch
            </label>
            {/* ✅ DYNAMIC: Dropdown populated from batches */}
            <select
              value={newTruck.batch}
              onChange={(e) => setNewTruck({ ...newTruck, batch: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value={0}>-- Select Batch --</option>
              {batchList.map((batch) => (
                <option key={batch.extraLiters} value={batch.extraLiters}>
                  {batch.extraLiters} Liters ({batch.count} trucks)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddTruck}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5 inline mr-2" />
            Add Truck
          </button>
        </div>
      </div>

      {/* ✅ DYNAMIC: Batch Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {batchList.map((batch, index) => (
          <div key={batch.extraLiters} className="border-2 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Fuel className="w-6 h-6 text-indigo-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {batch.extraLiters}L Extra Fuel
                  </h3>
                  <p className="text-sm text-gray-600">
                    {batch.count} truck{batch.count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBatch({ old: batch.extraLiters, new: batch.extraLiters })}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit batch"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteBatch(batch.extraLiters)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                  title="Delete batch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Truck list */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {batch.trucks.map((truck) => (
                <div key={truck.truckSuffix} className="bg-white rounded-lg p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 uppercase">
                      {truck.truckSuffix}
                    </span>
                    <button
                      onClick={() => handleDeleteTruck(truck.truckSuffix)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Batch Modal */}
      {showCreateBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Create New Batch</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Extra Liters Allocation
              </label>
              <input
                type="number"
                value={newBatchLiters}
                onChange={(e) => setNewBatchLiters(parseInt(e.target.value))}
                placeholder="e.g., 120, 75, 90"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreateBatch}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateBatchModal(false)}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Migration Strategy

### Phase 1: Database Migration
1. **Backup existing data**
2. **Create migration script** to convert:
   ```javascript
   {
     batch_100: [trucks],
     batch_80: [trucks],
     batch_60: [trucks]
   }
   // TO:
   {
     "100": [trucks],
     "80": [trucks],
     "60": [trucks]
   }
   ```
3. **Update schema** to remove enum validation
4. **Test migration** in dev environment

### Phase 2: Backend Refactor
1. Update `SystemConfig` model
2. Implement new controllers: `createBatch`, `updateBatch`, `deleteBatch`
3. Refactor existing controllers to be dynamic
4. Update routes and validation
5. **Comprehensive testing**

### Phase 3: Frontend Refactor
1. Update TypeScript types
2. Update API service
3. Create new React Query hooks
4. Refactor UI components for dynamic rendering
5. **UI/UX testing**

### Phase 4: Testing & Deployment
1. Integration testing
2. Data migration testing
3. Staged rollout (dev → staging → production)
4. Monitor for issues

---

## Estimated Effort

| Component | Complexity | Time Estimate |
|-----------|-----------|---------------|
| Database Migration Script | Medium | 4 hours |
| Backend Model Update | Medium | 3 hours |
| Backend Controller Refactor | High | 8 hours |
| Backend Routes & Validation | Low | 2 hours |
| Frontend Types Update | Low | 1 hour |
| Frontend API Service | Low | 2 hours |
| Frontend Hooks Refactor | Medium | 4 hours |
| Frontend UI Refactor | High | 10 hours |
| Testing (Unit + Integration) | High | 12 hours |
| Migration Testing | Medium | 6 hours |
| Documentation | Low | 2 hours |
| **TOTAL** | | **54 hours (~7 days)** |

---

## Risks & Considerations

### Technical Risks:
1. **Data Loss During Migration** - Mitigation: Comprehensive backups
2. **Breaking Changes** - Mitigation: Staged rollout, feature flags
3. **Performance Impact** - Mitigation: Indexing, caching
4. **Type Safety Loss** - Mitigation: Runtime validation, Zod schemas

### Business Risks:
1. **User Confusion** - Users accustomed to 3 batches
2. **Training Required** - Admin users need guidance
3. **Backward Compatibility** - Old DO records reference old batches

### Recommendations:
- **Implement Feature Flag** - Enable/disable dynamic batches
- **Gradual Rollout** - Start with 3 default batches + allow creation
- **Audit Logging** - Track all batch changes
- **UI Guidance** - Tooltips, help text, examples

---

## Alternative: Quick Fix (NOT RECOMMENDED ⚠️)

If you want a **temporary workaround** without full refactor:

### Add More Hardcoded Batches
```typescript
// Add batch_120, batch_90, batch_75, etc.
truckBatches?: {
  batch_100: ITruckBatch[];
  batch_80: ITruckBatch[];
  batch_60: ITruckBatch[];
  batch_120: ITruckBatch[];  // NEW
  batch_90: ITruckBatch[];   // NEW
  batch_75: ITruckBatch[];   // NEW
}
```

**Why NOT recommended:**
- Doesn't scale (what if you need 150L next month?)
- Code duplication everywhere
- Still hardcoded, defeats flexibility purpose
- Technical debt accumulates

---

## Conclusion

**Current State**: System is **100% hardcoded** for exactly 3 batch sizes (60L, 80L, 100L).

**Requested Feature**: Allow admin to create **any custom batch size** dynamically.

**Required Changes**: **Major refactor** across:
- Database schema (remove enum, use Map)
- Backend controllers (remove if/else, use dynamic loops)
- Backend validation (remove hardcoded checks)
- Frontend types (remove union types)
- Frontend UI (dynamic rendering)
- React Query hooks (dynamic batch search)

**Recommendation**: Proceed with **Option A: Map-Based Dynamic Batches**. It's the most flexible and scalable solution.

**Timeline**: ~7 working days (54 hours) for full implementation and testing.

---

## Next Steps

1. **Get Approval** for 7-day refactor timeline
2. **Create Feature Branch**: `feature/dynamic-batch-system`
3. **Database Backup** before any changes
4. **Implement Phase 1** (Database Migration)
5. **Incremental Testing** after each phase
6. **Code Review** before merging to main
7. **Deploy to Staging** first
8. **User Acceptance Testing**
9. **Production Deployment** with rollback plan

---

**Questions?** Let me know if you want me to start implementing this system!
