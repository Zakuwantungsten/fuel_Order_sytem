# Fuel Order System — Concurrency & Data Integrity Implementation Plan

> **Reference document** — updated after each phase completes.  
> Use this to resume work, track what changed where, and know exactly what the next phase is.  
> Last updated: Phase 0 (Research complete, implementation not yet started)

---

## Quick Status Board

| Phase | Title | Status | Files Changed |
|-------|-------|--------|---------------|
| 1 | Critical Data Integrity | 🔲 Not Started | — |
| 2 | Audit Trail Completion | 🔲 Not Started | — |
| 3 | Real-time Latency Fix | 🔲 Not Started | — |
| 4 | Role-scoped Field Access | 🔲 Not Started | — |
| 5 | Edit Locks + Justification | 🔲 Not Started | — |
| 6 | Change Streams + Polish | 🔲 Not Started | — |

---

## Full Problem → Fix Map (Reference)

| # | Problem | Severity | Phase |
|---|---------|----------|-------|
| 1 | No optimistic locking on FuelRecord/LPO/DO — silent overwrites | 🔴 Critical | 1 |
| 2 | DO→FuelRecord→LPO cascade not in a transaction — partial failures cause permanent inconsistency | 🔴 Critical | 1 |
| 3 | DO soft-delete does NOT cascade to FuelRecord or LPOs | 🔴 Critical | 1 |
| 4 | `getNextLPONumber` read-modify-write race produces duplicate LPO numbers | 🔴 Critical | 1 |
| 5 | 2–5s delay: WebSocket sends "go fetch" signal, not actual data | 🟠 High | 3 |
| 6 | React Query staleTime (5 min) silently discards WebSocket-triggered refetches | 🟠 High | 3 |
| 7 | LPO update audit has empty `previousValue` — liters amendment is invisible | 🟠 High | 2 |
| 8 | DO cancel cascade sets LPO `isDeleted: true` instead of `isCancelled: true` | 🟠 High | 2 |
| 9 | No field-level access control per role in update controllers | 🟠 High | 4 |
| 10 | No "currently editing" awareness between roles | 🟠 High | 5 |
| 11 | Sensitive field changes (ltrs, tonnages, ratePerTon) have no mandatory justification | 🟠 High | 5 |
| 12 | LPO create audit omits financial fields (`ltrs`, `pricePerLtr`, `paymentMode`) | 🟡 Medium | 2 |
| 13 | `emitDataChange` fires after `res.json()` — skipped on error paths | 🟡 Medium | 6 |
| 14 | 409 conflict has no UI resolution — user hits "Error" and retries blind | 🟡 Medium | 6 |
| 15 | All clients re-fetch entire list on any single-record change | 🟡 Medium | 3 |
| 16 | Journey queue reorder loop not atomic (individual `save()` calls) | 🟡 Medium | 1 |
| 17 | LPO `updateMany` cancel/update cascade produces no per-record audit trail | 🟡 Medium | 2 |
| 18 | `originalLtrs` / `amendedAt` fields in LPOEntry schema never populated | 🟡 Medium | 2 |
| 19 | No Timeline / history UI on any record detail view | 🟡 Medium | 6 |

---

## Phase 1 — Critical Data Integrity

**Goal:** Stop silent data corruption, duplicate records, and partial-failure inconsistencies.  
**Backend only** — no frontend changes needed.  
**Status:** 🔲 Not Started

### 1-A: Optimistic Locking on FuelRecord, LPOEntry, DeliveryOrder

**The Problem:**  
All three `update` controllers follow the same dangerous pattern:
1. `findOne()` — read existing record into memory
2. Do logic using those in-memory values (balance recalculation, change tracking)
3. `findOneAndUpdate()` — write without checking if the DB record changed between steps 1 and 3

If two users edit the same record simultaneously, the last HTTP response wins and silently overwrites the first user's changes.

**The Fix — approach chosen: `updatedAt` as version token**

Mongoose sets `updatedAt` automatically via `{ timestamps: true }` on all three schemas. The client sends back the `updatedAt` it read when it opened the form. The server includes `updatedAt` in the DB query filter. If another user saved in between, `updatedAt` no longer matches → `findOneAndUpdate` returns `null` → server returns `409 Conflict` with the current record + who last modified it.

**Files to change:**

| File | Change |
|------|--------|
| `backend/src/controllers/fuelRecordController.ts` | `updateFuelRecord`: add `clientUpdatedAt` to body, include in filter |
| `backend/src/controllers/lpoEntryController.ts` | `updateLPOEntry`: same pattern |
| `backend/src/controllers/deliveryOrderController.ts` | `updateDeliveryOrder`: same pattern |
| `backend/src/middleware/validation.ts` | Add optional `clientUpdatedAt` (ISO date string) to update validation schemas |
| `frontend/src/pages/FuelRecords.tsx` | Pass `updatedAt` from the record being edited in the PUT request body |
| `frontend/src/pages/LPOs.tsx` | Same |
| `frontend/src/pages/DeliveryOrders.tsx` | Same |
| `frontend/src/services/api.ts` (or per-service file) | Handle 409 response: show conflict modal, not generic error toast |

**Exact code pattern (backend — replicate in all three controllers):**

```typescript
// In updateFuelRecord / updateLPOEntry / updateDeliveryOrder:

const { clientUpdatedAt, ...otherUpdates } = updates;

// Build filter — include version guard if client sent updatedAt
const filter: any = { _id: id, isDeleted: false };
if (clientUpdatedAt) {
  filter.updatedAt = new Date(clientUpdatedAt);
}

const record = await FuelRecord.findOneAndUpdate(
  filter,
  otherUpdates,
  { new: true, runValidators: true }
);

if (!record) {
  // Distinguish: does the record exist at all?
  const exists = await FuelRecord.exists({ _id: id, isDeleted: false });
  if (exists) {
    // Version mismatch — fetch current state to send back
    const current = await FuelRecord.findOne({ _id: id, isDeleted: false })
      .select('updatedAt truckNo goingDo lastModifiedBy');
    throw new ApiError(409, 'Record was modified by another user since you opened it.', { current });
  }
  throw new ApiError(404, 'Record not found');
}
```

**Frontend pattern:**

```typescript
// When opening a form to edit, store the record's updatedAt
const [editingRecord, setEditingRecord] = useState<FuelRecord | null>(null);

// When submitting:
await api.put(`/fuel-records/${editingRecord.id}`, {
  ...formValues,
  clientUpdatedAt: editingRecord.updatedAt,   // ← send this
});

// In the API error handler:
if (error.status === 409) {
  setConflictData(error.data.current);  // show conflict modal
}
```

**Alternative (simpler, automatic):** Enable Mongoose built-in optimistic concurrency:
```typescript
// In FuelRecord.ts schema definition:
const fuelRecordSchema = new Schema<IFuelRecordDocument>({...}, {
  timestamps: true,
  optimisticConcurrency: true,   // ← adds __v version check automatically
});
```
Mongoose then auto-increments `__v` on every save and throws `VersionError` if the version doesn't match. Downside: requires the client to send `__v` back.

**Decision made:** Use `updatedAt` approach (more transparent, works with `findOneAndUpdate`, no schema change needed).

---

### 1-B: MongoDB Transactions for Cascade Operations

**The Problem:**  
Three cascade chains are NOT atomic:

1. `updateDeliveryOrder` → `cascadeUpdateToFuelRecord` → `cascadeToLPOEntries`
2. `cancelDeliveryOrder` → `cascadeCancelFuelRecord` → `cascadeToLPOEntries`
3. `activateNextQueuedJourney` → reorder loop with individual `save()` calls

Any step 2 or 3 failure leaves data in a permanently split state with no rollback.

**The Fix — MongoDB sessions + `withTransaction()`**

Requires replica set (Railway MongoDB provides this). Pattern:

```typescript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // ALL db operations inside this callback share the session
    await DeliveryOrder.findOneAndUpdate(filter, update, { session, new: true });
    await FuelRecord.findByIdAndUpdate(frId, frUpdates, { session });
    await LPOEntry.updateMany(lpoFilter, lpoUpdates, { session });
  });
} finally {
  await session.endSession();
}
```

**Files to change:**

| File | Function | Change |
|------|----------|--------|
| `backend/src/controllers/deliveryOrderController.ts` | `updateDeliveryOrder` | Wrap in `session.withTransaction()` |
| `backend/src/controllers/deliveryOrderController.ts` | `cancelDeliveryOrder` | Wrap in `session.withTransaction()` |
| `backend/src/controllers/deliveryOrderController.ts` | `cascadeUpdateToFuelRecord` | Accept `session` param, pass to all DB calls |
| `backend/src/controllers/deliveryOrderController.ts` | `cascadeToLPOEntries` | Accept `session` param, pass to `updateMany`/`updateOne` |
| `backend/src/controllers/deliveryOrderController.ts` | `cascadeCancelFuelRecord` | Accept `session` param, pass to all DB calls |
| `backend/src/controllers/fuelRecordController.ts` | `activateNextQueuedJourney` | Wrap reorder loop in session transaction |

**Important:** Update all cascade helper function signatures to accept an optional `session?: mongoose.ClientSession` parameter and pass `{ session }` to every Mongoose query inside them.

---

### 1-C: DO Soft-Delete Cascade to FuelRecord and LPOs

**The Problem:**  
`deleteDeliveryOrder` just tombstones the DO with `isDeleted: true`. The linked FuelRecord still has `goingDo: "DO-2026-001"` pointing at a document that no longer exists in normal queries. Linked LPO entries remain fully active.

**The Fix:**

```typescript
// In deleteDeliveryOrder, after findByIdAndUpdate:

const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // 1. Soft-delete the DO
    await DeliveryOrder.findByIdAndUpdate(id, 
      { isDeleted: true, deletedAt: new Date() }, 
      { session }
    );

    // 2. Null out the DO reference on the linked FuelRecord
    if (deliveryOrder.importOrExport === 'IMPORT') {
      await FuelRecord.findOneAndUpdate(
        { goingDo: deliveryOrder.doNumber, isDeleted: false },
        { $unset: { goingDo: '' }, isLocked: true, pendingConfigReason: 'missing_total_liters' },
        { session }
      );
    } else {
      await FuelRecord.findOneAndUpdate(
        { returnDo: deliveryOrder.doNumber, isDeleted: false },
        { $unset: { returnDo: '' } },
        { session }
      );
    }

    // 3. Soft-delete linked LPO entries
    await LPOEntry.updateMany(
      { doSdo: deliveryOrder.doNumber, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { session }
    );
  });
} finally {
  await session.endSession();
}
```

**Files to change:**

| File | Function | Change |
|------|----------|--------|
| `backend/src/controllers/deliveryOrderController.ts` | `deleteDeliveryOrder` | Add cascade inside transaction (see above) |

---

### 1-D: Fix LPO Number Race Condition

**The Problem:**  
`getNextLPONumber` does `findOne().sort({ lpoNo: -1 })` then increments in application code. Two concurrent requests both read the same "last" number and both generate the same next number. MongoDB's `LPOEntry` collection has no unique constraint on `lpoNo`.

**The Fix — atomic counter document:**

```typescript
// New model: backend/src/models/Counter.ts
const counterSchema = new Schema({
  _id: String,          // e.g. "lpo_2026"
  seq: { type: Number, default: 0 },
});
export const Counter = mongoose.model('Counter', counterSchema);

// In lpoEntryController.ts — getNextLPONumber:
export const getNextLPONumber = async (req, res) => {
  const year = new Date().getFullYear();
  const counterId = `lpo_${year}`;
  
  // findOneAndUpdate with $inc is atomic — safe under any concurrency
  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  
  res.json({ success: true, data: { nextLPONo: counter.seq.toString() } });
};

// In createLPOEntry — don't trust client-provided lpoNo, generate it server-side:
const year = new Date().getFullYear();
const counter = await Counter.findOneAndUpdate(
  { _id: `lpo_${year}` },
  { $inc: { seq: 1 } },
  { upsert: true, new: true }
);
payload.lpoNo = counter.seq.toString();
```

Additionally, add a **unique compound index** on LPOEntry as a safety backstop:
```typescript
lpoEntrySchema.index({ lpoNo: 1, year: 1 }, { unique: true });
// Note: LPOEntry schema needs a 'year' field if not already there
// OR use: lpoEntrySchema.index({ lpoNo: 1, actualDate: 1 }, { unique: true, sparse: true });
```

**Files to change:**

| File | Change |
|------|--------|
| `backend/src/models/Counter.ts` | **Create new file** — atomic counter model |
| `backend/src/models/index.ts` | Export `Counter` |
| `backend/src/controllers/lpoEntryController.ts` | `getNextLPONumber`: use Counter model |
| `backend/src/controllers/lpoEntryController.ts` | `createLPOEntry`: generate lpoNo server-side via Counter |
| `backend/src/models/LPOEntry.ts` | Add unique compound index on `lpoNo` + year |

---

## Phase 2 — Audit Trail Completion

**Goal:** Make the audit log actually capture what changed, who changed it, and why — for every sensitive operation.  
**Backend only** — frontend gets a read-only Timeline UI in Phase 6.  
**Status:** 🔲 Not Started  
**Prerequisite:** Phase 1 complete (the `findOne` before update pattern needed for Phase 1 optimistic locking also gives us the `previousValue` we need for audit diffs).

### 2-A: LPO Update — Full Field-Level Audit Diff

**The Problem:**  
`updateLPOEntry` passes `previousValue: {}` (empty object) to `logUpdate`. Amendment to `ltrs` (most sensitive field) is completely invisible in audit history.

**The Fix:**

```typescript
// In updateLPOEntry:
const existingEntry = await LPOEntry.findOne({ _id: id, isDeleted: false });
if (!existingEntry) throw new ApiError(404, 'LPO entry not found');

// ... build filter with version guard (Phase 1) ...

const lpoEntry = await LPOEntry.findOneAndUpdate(filter, updates, { new: true, runValidators: true });

// Field-level diff for audit
const sensitiveFields = ['ltrs', 'pricePerLtr', 'paymentMode', 'currency', 'dieselAt', 'truckNo', 'doSdo', 'destinations', 'lpoNo'];
const previousSnapshot: Record<string, any> = {};
const newSnapshot: Record<string, any> = {};
for (const field of sensitiveFields) {
  const prev = (existingEntry as any)[field];
  const next = (lpoEntry as any)[field];
  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    previousSnapshot[field] = prev;
    newSnapshot[field] = next;
  }
}

await AuditService.logUpdate(
  req.user?.userId || 'system',
  req.user?.username || 'system',
  'LPOEntry',
  lpoEntry._id.toString(),
  Object.keys(previousSnapshot).length > 0 ? previousSnapshot : { lpoNo: existingEntry.lpoNo },
  Object.keys(newSnapshot).length > 0 ? newSnapshot : { lpoNo: lpoEntry.lpoNo },
  req.ip
);
```

### 2-B: Populate `originalLtrs` and `amendedAt` on LPO Liters Change

**The Problem:**  
The LPOEntry schema has `originalLtrs` and `amendedAt` fields but the update controller never writes them. An amendment to liters leaves no trace in the document itself (only in audit log after 2-A is fixed).

**The Fix (add to updateLPOEntry, after fetching existingEntry):**

```typescript
// Detect liters amendment
if (updates.ltrs !== undefined && updates.ltrs !== existingEntry.ltrs) {
  // Only set originalLtrs the FIRST time (don't overwrite with a subsequent amendment's value)
  if (existingEntry.originalLtrs === null || existingEntry.originalLtrs === undefined) {
    updates.originalLtrs = existingEntry.ltrs;
  }
  updates.amendedAt = new Date();
}
```

**Files to change:**

| File | Function | Change |
|------|----------|--------|
| `backend/src/controllers/lpoEntryController.ts` | `updateLPOEntry` | Read full `existingEntry` first; compute field diff; populate `originalLtrs`/`amendedAt`; pass diff to `logUpdate` |

### 2-C: Fix DO Cancel Cascade — `isCancelled` Not `isDeleted`

**The Problem:**  
`cascadeToLPOEntries('cancel')` sets `{ isDeleted: true, deletedAt: new Date() }` on linked LPOs. This:
- Makes them invisible to the `isDeleted: false` filter (correct — they shouldn't appear active)
- Makes them also invisible to `status=cancelled` filter (wrong — they should be visible as cancelled)
- The LPOEntry model has proper `isCancelled`, `cancelledAt` fields that are never used by this path

**The Fix:**

```typescript
// In cascadeToLPOEntries when action === 'cancel':
const result = await LPOEntry.updateMany(
  { doSdo: doNumber, isDeleted: false },
  {
    isCancelled: true,
    cancelledAt: new Date(),
    // Store the cancellation reason passed from the DO cancel
    // Add cancellationReason param to the function signature
  },
  { session }  // use session from Phase 1 transaction wrapper
);
```

Update the function signature:
```typescript
const cascadeToLPOEntries = async (
  doNumber: string,
  action: 'update' | 'cancel',
  updates?: { truckNo?: string; destination?: string },
  cancellationReason?: string,
  session?: mongoose.ClientSession
): Promise<{ count: number }>
```

**Files to change:**

| File | Function | Change |
|------|----------|--------|
| `backend/src/controllers/deliveryOrderController.ts` | `cascadeToLPOEntries` | Change cancel action to set `isCancelled/cancelledAt`; add `cancellationReason` + `session` params |
| `backend/src/controllers/deliveryOrderController.ts` | `cancelDeliveryOrder` | Pass `cancellationReason` to `cascadeToLPOEntries` |

### 2-D: LPO Create Audit — Include Financial Fields

**The Problem:**  
`createLPOEntry` audit call only passes `{ lpoNo, truckNo, station }` as `newValue`. Missing: `ltrs`, `pricePerLtr`, `paymentMode`, `currency`, `doSdo`, `destinations`.

**The Fix (simple one-liner change):**

```typescript
// In createLPOEntry, change:
await AuditService.logCreate(
  req.user?.userId || 'system',
  req.user?.username || 'system',
  'LPOEntry',
  lpoEntry._id.toString(),
  { lpoNo: lpoEntry.lpoNo, truckNo: lpoEntry.truckNo, station: lpoEntry.dieselAt },  // ← old
  req.ip
);

// To:
await AuditService.logCreate(
  req.user?.userId || 'system',
  req.user?.username || 'system',
  'LPOEntry',
  lpoEntry._id.toString(),
  {
    lpoNo: lpoEntry.lpoNo,
    truckNo: lpoEntry.truckNo,
    dieselAt: lpoEntry.dieselAt,
    ltrs: lpoEntry.ltrs,
    pricePerLtr: lpoEntry.pricePerLtr,
    paymentMode: lpoEntry.paymentMode,
    currency: lpoEntry.currency,
    doSdo: lpoEntry.doSdo,
    destinations: lpoEntry.destinations,
  },
  req.ip
);
```

**Files to change:**

| File | Function | Change |
|------|----------|--------|
| `backend/src/controllers/lpoEntryController.ts` | `createLPOEntry` | Expand `newValue` in `logCreate` call |

---

## Phase 3 — Real-time Latency Fix

**Goal:** Eliminate the 2–5 second delay. Reduce real-time update delivery to ~100ms.  
**Both backend and frontend changes.** Items 5 and 6 MUST ship together — fixing one without the other is incomplete.  
**Status:** 🔲 Not Started  
**Prerequisite:** Phase 1 complete (stable data layer first).

### 3-A: Backend — Push Actual Document in `emitDataChange`

**The Problem:**  
`emitDataChange` broadcasts `{ collection, action, timestamp }`. Every client then makes a full HTTP GET to re-fetch the entire list. This is the source of the 2–5s delay.

**The Fix:**

Change `emitDataChange` signature to optionally carry the mutated document:

```typescript
// backend/src/services/websocket.ts

export const emitDataChange = (
  collection: string,
  action: 'create' | 'update' | 'delete' = 'update',
  changedDocument?: Record<string, any>   // ← add this
): void => {
  if (!io) return;
  io.emit('data_changed', {
    collection,
    action,
    timestamp: Date.now(),
    record: changedDocument ?? null,       // ← include document payload
  });
};
```

Then update each controller call to pass the saved document:

```typescript
// fuelRecordController.ts — after update:
emitDataChange('fuel_records', 'update', fuelRecord.toObject());

// lpoEntryController.ts — after create:
emitDataChange('lpo_entries', 'create', lpoEntry.toObject());

// deliveryOrderController.ts — after update:
emitDataChange('delivery_orders', 'update', deliveryOrder.toObject());
```

**Files to change:**

| File | Change |
|------|--------|
| `backend/src/services/websocket.ts` | Add `changedDocument?` param to `emitDataChange`; include as `record` in emitted payload |
| `backend/src/controllers/fuelRecordController.ts` | All `emitDataChange` calls: pass document |
| `backend/src/controllers/lpoEntryController.ts` | All `emitDataChange` calls: pass document |
| `backend/src/controllers/deliveryOrderController.ts` | All `emitDataChange` calls: pass document |

### 3-B: Frontend — `useRealtimeSync` → `queryClient.setQueryData`

**The Problem:**  
`useRealtimeSync` calls an `onRefresh` callback which triggers a full re-fetch. Even if the network request completes, React Query's 5-minute `staleTime` may serve the old cached value and silently discard the fresh response.

**The Fix:**

Redesign `useRealtimeSync` to inject the socket-delivered payload directly into the React Query cache:

```typescript
// frontend/src/hooks/useRealtimeSync.ts

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToDataChanges, unsubscribeFromDataChanges } from '../services/websocket';

export function useRealtimeSync(
  collections: string | string[],
  queryKeys: unknown[][],           // ← React Query keys to invalidate/update
  onRefresh?: () => void,           // ← optional fallback for non-keyed refreshes
  id?: string
) {
  const queryClient = useQueryClient();
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; });

  const cols = Array.isArray(collections) ? collections : [collections];
  const subId = id || `rt-${cols.join('+')}`;

  useEffect(() => {
    subscribeToDataChanges((event) => {
      if (!cols.includes(event.collection)) return;

      if (event.record && event.action === 'update') {
        // Inject the received document directly into the per-record cache
        const recordId = event.record._id || event.record.id;
        if (recordId) {
          // Update the individual record cache entry (bypasses staleTime completely)
          queryClient.setQueryData([event.collection, recordId], event.record);
        }
        // Invalidate list queries so next list fetch gets fresh data
        // (invalidation schedules a background refetch but doesn't block render)
        queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      } else {
        // For create/delete: must invalidate lists (no specific record to inject)
        queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
        refreshRef.current?.();
      }
    }, subId);

    return () => unsubscribeFromDataChanges(subId);
  }, [subId]);
}
```

**Files to change:**

| File | Change |
|------|--------|
| `frontend/src/hooks/useRealtimeSync.ts` | Full redesign — inject into cache via `setQueryData`, invalidate lists |
| `frontend/src/pages/FuelRecords.tsx` | Update `useRealtimeSync` call with proper query keys |
| `frontend/src/pages/LPOs.tsx` | Update `useRealtimeSync` call with proper query keys |
| `frontend/src/pages/DeliveryOrders.tsx` | Update `useRealtimeSync` call with proper query keys |
| `frontend/src/services/websocket.ts` | Update `data_changed` event type to include `record?: any` field |

---

## Phase 4 — Role-scoped Field Access

**Goal:** Prevent lower-privilege roles from updating fields they should not control, even if they hit the update endpoint.  
**Backend only.**  
**Status:** 🔲 Not Started  
**Prerequisite:** Phase 1 complete.

### 4-A: Field Allowlists Per Role in Update Controllers

**The Problem:**  
`PUT /fuel-records/:id` accepts writes from 12 roles, all via the same `updateFuelRecord` function, with zero field-level restrictions. A `fuel_order_maker` could (in theory) send `{ totalLts: 0 }` and the server applies it — that field should only be writable by `admin+`.

**The Fix — role-based field allowlists:**

```typescript
// backend/src/utils/roleFieldPolicy.ts  (NEW FILE)

const FUEL_RECORD_FIELD_POLICY: Record<string, string[]> = {
  // Only admin and above can touch financial configuration
  admin: ['totalLts', 'extra', 'balance', 'isLocked', 'pendingConfigReason', 
          'truckNo', 'goingDo', 'returnDo', 'date', 'month', 'from', 'to',
          'mmsaYard', 'tangaYard', 'darYard',
          'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
          'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
          'journeyStatus', 'queueOrder', 'start'],
  // fuel_order_maker can only update checkpoint values and journey fields
  fuel_order_maker: ['darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
                     'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
                     'journeyStatus', 'start'],
  // Yard roles can only update their yard's allocation
  dar_yard: ['darYard'],
  tanga_yard: ['tangaYard'],
  mmsa_yard: ['mmsaYard'],
  // Drivers: read-only via API (no update access on new route guard)
};

// Roles that inherit admin-level access
const ADMIN_EQUIVALENT = new Set(['super_admin', 'manager', 'super_manager', 'boss', 'supervisor']);

export function filterUpdatableFields(
  updates: Record<string, any>,
  role: string
): Record<string, any> {
  if (ADMIN_EQUIVALENT.has(role)) role = 'admin';
  const allowedFields = FUEL_RECORD_FIELD_POLICY[role] ?? FUEL_RECORD_FIELD_POLICY['admin'];
  const filtered: Record<string, any> = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) filtered[field] = updates[field];
  }
  return filtered;
}
```

Apply in controller:
```typescript
// In updateFuelRecord:
const role = req.user?.role || 'fuel_order_maker';
const permittedUpdates = filterUpdatableFields(updates, role);
// Use permittedUpdates instead of updates for the DB call
```

**Files to change:**

| File | Change |
|------|--------|
| `backend/src/utils/roleFieldPolicy.ts` | **Create new file** — field allowlist maps for FuelRecord, LPOEntry, DeliveryOrder |
| `backend/src/controllers/fuelRecordController.ts` | `updateFuelRecord`: apply `filterUpdatableFields` |
| `backend/src/controllers/lpoEntryController.ts` | `updateLPOEntry`: apply LPO-specific allowlist |
| `backend/src/controllers/deliveryOrderController.ts` | `updateDeliveryOrder`: apply DO-specific allowlist |

---

## Phase 5 — Edit Locks + Mandatory Justification

**Goal:** Prevent two users from editing the same record simultaneously; force documented reasons for sensitive changes.  
**Both backend and frontend.**  
**Status:** 🔲 Not Started  
**Prerequisite:** Phase 1 complete.

### 5-A: Soft Edit Locks with TTL

**Schema change** — add to FuelRecord, LPOEntry, DeliveryOrder:

```typescript
editLock: {
  lockedBy: { type: String, default: null },        // username
  lockedByName: { type: String, default: null },    // display name
  lockedAt: { type: Date, default: null },
  lockedUntil: { type: Date, default: null },        // lockedAt + 5 min
}
```

**New API endpoints:**

```
POST /fuel-records/:id/lock       → acquire lock (called when user opens edit form)
DELETE /fuel-records/:id/lock     → release lock (called on save or cancel)
```

Same pattern for `/lpo-entries/:id/lock` and `/delivery-orders/:id/lock`.

**Lock logic:**

```typescript
export const acquireEditLock = async (req, res) => {
  const { id } = req.params;
  const username = req.user?.username;
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 min TTL

  const record = await FuelRecord.findOneAndUpdate(
    {
      _id: id,
      isDeleted: false,
      $or: [
        { 'editLock.lockedBy': null },
        { 'editLock.lockedBy': username },       // user re-acquiring own lock
        { 'editLock.lockedUntil': { $lt: now } } // expired lock
      ]
    },
    {
      'editLock.lockedBy': username,
      'editLock.lockedByName': req.user?.username,
      'editLock.lockedAt': now,
      'editLock.lockedUntil': lockUntil,
    },
    { new: true }
  );

  if (!record) {
    const current = await FuelRecord.findById(id).select('editLock');
    throw new ApiError(423, `Record is being edited by ${current?.editLock?.lockedBy}`, { editLock: current?.editLock });
  }

  // Emit lock acquired event so other users see the "being edited" badge
  emitDataChange('fuel_records', 'update', record.toObject());
  res.json({ success: true, message: 'Lock acquired', lockedUntil: lockUntil });
};
```

**Frontend:**
- On edit button click: call `POST /fuel-records/:id/lock`
  - If 423: show "Currently being edited by [name] — try again after [time]"
  - If 200: open edit modal/form
- On modal close (save OR cancel): call `DELETE /fuel-records/:id/lock`
- Use `beforeunload` event to release lock if browser closes
- In list/detail view: show a "🔒 Being edited by X" badge when `editLock.lockedBy` is set and `lockedUntil > now`

### 5-B: Mandatory Justification for Sensitive Field Changes

**Sensitive fields requiring reason:**

| Entity | Fields | Minimum reason length |
|--------|--------|-----------------------|
| LPOEntry | `ltrs`, `pricePerLtr`, `paymentMode`, `isCancelled` | 10 chars |
| FuelRecord | `totalLts`, `extra`, `isLocked` unlock | 10 chars |
| DeliveryOrder | `tonnages`, `ratePerTon`, `destination`, cancellation | 10 chars |

**Backend validation (add to update validators in `middleware/validation.ts`):**

```typescript
// Custom validator: if any sensitive field changes, reason is required
body('reason')
  .if((value, { req }) => {
    const sensitiveFields = ['ltrs', 'pricePerLtr', 'paymentMode'];
    return sensitiveFields.some(f => req.body[f] !== undefined);
  })
  .notEmpty().withMessage('A reason is required when changing quantity or pricing fields')
  .isLength({ min: 10 }).withMessage('Reason must be at least 10 characters')
```

**Frontend:** Show a "Reason for change" textarea whenever a watched field is modified before allowing Save.

**Files to change:**

| File | Change |
|------|--------|
| `backend/src/models/FuelRecord.ts` | Add `editLock` subdocument |
| `backend/src/models/LPOEntry.ts` | Add `editLock` subdocument |
| `backend/src/models/DeliveryOrder.ts` | Add `editLock` subdocument |
| `backend/src/routes/fuelRecordRoutes.ts` | Add `POST/DELETE /:id/lock` routes |
| `backend/src/routes/lpoEntryRoutes.ts` | Add `POST/DELETE /:id/lock` routes |
| `backend/src/routes/deliveryOrderRoutes.ts` | Add `POST/DELETE /:id/lock` routes |
| `backend/src/controllers/fuelRecordController.ts` | Add `acquireEditLock`, `releaseEditLock` |
| `backend/src/controllers/lpoEntryController.ts` | Add `acquireEditLock`, `releaseEditLock` |
| `backend/src/controllers/deliveryOrderController.ts` | Add `acquireEditLock`, `releaseEditLock` |
| `backend/src/middleware/validation.ts` | Add reason validator for sensitive field changes |
| `frontend/src/pages/FuelRecords.tsx` | Lock on edit open, release on close, show lock badge |
| `frontend/src/pages/LPOs.tsx` | Same |
| `frontend/src/pages/DeliveryOrders.tsx` | Same |
| `frontend/src/components/` | New `EditLockBadge` component + `ConflictModal` component |

---

## Phase 6 — Change Streams + Polish

**Goal:** Architectural improvement to real-time layer; UI polish for conflicts and history.  
**Status:** 🔲 Not Started  
**Prerequisite:** Phases 1–5 complete.

### 6-A: MongoDB Change Streams (replaces manual `emitDataChange`)

**The Problem:**  
`emitDataChange` must be manually called in every code path. If a new controller is added and the developer forgets, that collection never broadcasts. It also fires after `res.json()` which is slightly wrong ordering.

**The Fix:**

```typescript
// backend/src/services/changeStreamListener.ts  (NEW FILE)
import { FuelRecord, LPOEntry, DeliveryOrder } from '../models';
import { emitDataChange } from './websocket';
import logger from '../utils/logger';

const WATCHED_MODELS = [
  { model: FuelRecord, collection: 'fuel_records' },
  { model: LPOEntry, collection: 'lpo_entries' },
  { model: DeliveryOrder, collection: 'delivery_orders' },
];

export function startChangeStreams() {
  for (const { model, collection } of WATCHED_MODELS) {
    const stream = model.watch([], { fullDocument: 'updateLookup' });

    stream.on('change', (event: any) => {
      const action = event.operationType === 'insert' ? 'create'
        : event.operationType === 'delete' ? 'delete' : 'update';
      
      const document = event.fullDocument ?? null;
      emitDataChange(collection, action, document);
    });

    stream.on('error', (err) => {
      logger.error(`Change stream error for ${collection}:`, err);
      // Restart after delay
      setTimeout(() => startChangeStreams(), 5000);
    });

    logger.info(`Change stream started for: ${collection}`);
  }
}
```

Call `startChangeStreams()` in `server.ts` after DB connection.  
Then **remove all manual `emitDataChange` calls** from controllers — the stream handles them.

### 6-B: 409 Conflict Resolution UI

New `ConflictModal` component:
- Shows "Record updated by [username] at [time] while you were editing"
- Displays a diff table: Your Value | Current Value for each changed field
- Buttons: **Keep my changes** (retry with override flag), **Use latest** (discard and reload), **View diff** (side-by-side)

### 6-C: 423 Edit Lock UI

New `EditLockBadge` component for list rows and detail headers:
- Shows "🔒 Admin is editing" when `editLock.lockedBy` is set
- Auto-updates via real-time sync (lock acquire/release emits `data_changed`)

### 6-D: Timeline / History Tab

New `RecordTimeline` component:
- Queries `GET /audit-logs?resourceType=FuelRecord&resourceId=:id`
- Renders chronological event list: timestamp, actor (role + username), action, field diffs, reason
- Shown as a tab on FuelRecord detail, LPO detail, and DO detail views

### 6-E: Journey Queue Reorder Transaction (Item 16)

Wrap `activateNextQueuedJourney` reorder loop in a session:

```typescript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  // Mark current as completed
  await FuelRecord.findByIdAndUpdate(fuelRecord._id, 
    { journeyStatus: 'completed', completedAt: new Date() }, { session });
  
  // Activate next
  await FuelRecord.findByIdAndUpdate(nextJourney._id,
    { journeyStatus: 'active', activatedAt: new Date() }, { session });
  
  // Bulk-update remaining queue positions in one operation
  const bulkOps = remainingQueued.map((r, i) => ({
    updateOne: {
      filter: { _id: r._id },
      update: { $set: { queueOrder: i + 1 } },
    }
  }));
  if (bulkOps.length > 0) {
    await FuelRecord.bulkWrite(bulkOps, { session });
  }
});
await session.endSession();
```

---

## Architecture Decisions Record

| Decision | Rationale |
|----------|-----------|
| Use `updatedAt` version token (not `__v`) for optimistic locking | `updatedAt` is already set by Mongoose timestamps; `__v` requires schema change; `updatedAt` is human-readable in 409 responses |
| Use atomic `Counter` document for LPO numbers (not MAX+1) | `findOneAndUpdate + $inc` is guaranteed atomic under MongoDB's document-level locking; MAX+1 is a classic race condition |
| Fix `isCancelled` vs `isDeleted` cascade bug before Phase 3 | If left unfixed, the real-time cache injection (Phase 3) would distribute the wrong data to clients |
| Ship WebSocket push (3-A) and setQueryData (3-B) together | 3-A alone: backend pushes data but frontend ignores it due to staleTime. 3-B alone: hook expects payload that doesn't exist. They are codependent. |
| Keep `emitDataChange` in Phase 1–3, replace with Change Streams in Phase 6 | Change Streams are the better long-term architecture but require replica set validation and error handling. Safer to validate the payload/cache mechanism first. |
| Soft edit locks (not hard locks) | Hard locks block users permanently if their session dies. Soft locks with 5-minute TTL auto-expire. User experience is graceful degradation, not hard failure. |

---

## Files Changed — Running Tracker

> Update this section as each phase completes.

### Phase 1 Changes
*(not yet started)*

### Phase 2 Changes
*(not yet started)*

### Phase 3 Changes
*(not yet started)*

### Phase 4 Changes
*(not yet started)*

### Phase 5 Changes
*(not yet started)*

### Phase 6 Changes
*(not yet started)*

---

## Testing Checklist Per Phase

### Phase 1
- [ ] Two users update the same FuelRecord simultaneously → one gets 409, the other succeeds
- [ ] DO update with truck change: DeliveryOrder AND FuelRecord both show new truck, OR neither
- [ ] DO cancel: LPO entries are `isCancelled: true` (not `isDeleted: true`)
- [ ] DO soft-delete: FuelRecord no longer has `goingDo` pointing at deleted DO
- [ ] Two concurrent LPO creates → both get unique LPO numbers
- [ ] LPO numbers reset to 1 on January 1st of a new year

### Phase 2
- [ ] LPO with `ltrs` changed → audit log shows `previousValue.ltrs` and `newValue.ltrs`
- [ ] `originalLtrs` field on LPOEntry document populated on first amendment, unchanged on subsequent
- [ ] `amendedAt` field updated on every `ltrs` change
- [ ] LPO create audit includes `ltrs`, `pricePerLtr`, `paymentMode`
- [ ] Cancelled LPO (via DO cancel) shows up in `GET /lpo-entries?status=cancelled`

### Phase 3
- [ ] User A updates fuel record; User B (different browser) sees update within ~200ms without page refresh
- [ ] User B's React Query cache contains the new record data immediately (not 5 minutes stale)
- [ ] `data_changed` event payload includes `record` object
- [ ] Create and delete events still trigger list invalidation

### Phase 4
- [ ] `fuel_order_maker` cannot change `totalLts` via the update endpoint (field is stripped)
- [ ] `dar_yard` can only set `darYard`, not `tangaYard` or `mmsaYard`
- [ ] `super_admin` can change any field

### Phase 5
- [ ] User A opens edit on Record X → User B sees "🔒 Being edited by User A"
- [ ] User B's "Edit" button returns 423 with who holds the lock and until when
- [ ] Lock expires automatically after 5 minutes even if browser is closed
- [ ] Saving `ltrs` change without a reason → 400 validation error
- [ ] Saving `ltrs` change with reason < 10 chars → 400 validation error

### Phase 6
- [ ] Change stream fires on every update including cascade writes inside transactions
- [ ] Change stream reconnects automatically after disconnection
- [ ] 409 conflict modal shows field-level diff between user's payload and current state
- [ ] Timeline tab shows full history with actor, timestamp, changed fields, reason
