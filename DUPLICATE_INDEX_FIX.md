# Duplicate MongoDB Index Fix

## Issue
Mongoose was warning about duplicate schema indexes:
```
(node:124163) [MONGOOSE] Warning: Duplicate schema index on {"lpoNo":1} found. 
This is often due to declaring an index using both "index: true" and "schema.index()". 
Please remove the duplicate index definition.
```

## Root Cause
Fields were being indexed twice:
1. **Inline field definition**: `lpoNo: { type: String, index: true }`
2. **Schema-level index**: `schema.index({ lpoNo: 1 })`

This creates duplicate indexes, which:
- Wastes storage space
- Slows down write operations
- Generates warning messages
- Doesn't provide any benefit

## Files Fixed

### 1. `/backend/src/models/ArchivedData.ts`

**ArchivedLPOEntry Schema:**
- ❌ **Before**: `lpoNo: { type: String, index: true }` + `archivedLPOEntrySchema.index({ lpoNo: 1 })`
- ✅ **After**: `lpoNo: { type: String }` + `archivedLPOEntrySchema.index({ lpoNo: 1 })`
- Removed `archivedAt` inline index (kept schema-level index)
- Added compound index: `{ truckNo: 1, date: -1 }`

**ArchivedLPOSummary Schema:**
- ❌ **Before**: `lpoNo: { type: String, index: true }` with no schema index
- ✅ **After**: `lpoNo: { type: String }` + `archivedLPOSummarySchema.index({ lpoNo: 1 })`
- Removed `archivedAt` inline index (kept schema-level index)

### 2. `/backend/src/models/LPOEntry.ts`

**LPOEntry Schema:**
- ❌ **Before**: Two separate indexes:
  - `lpoEntrySchema.index({ lpoNo: 1 })`
  - `lpoEntrySchema.index({ lpoNo: 1, date: -1 })`
- ✅ **After**: Only compound index `lpoEntrySchema.index({ lpoNo: 1, date: -1 })`
- **Reason**: Compound index `{ lpoNo: 1, date: -1 }` can efficiently serve queries that:
  - Filter by `lpoNo` only (uses leftmost prefix)
  - Filter by `lpoNo` and sort by `date`
- Single-field index on `lpoNo` is redundant

## Index Strategy Applied

### Best Practices
1. **Prefer compound indexes** over multiple single-field indexes when fields are frequently queried together
2. **Leftmost prefix rule**: Compound index `{ a: 1, b: 1, c: 1 }` can serve:
   - Queries on `a`
   - Queries on `a, b`
   - Queries on `a, b, c`
3. **Avoid inline index definitions** when using schema-level indexes
4. **Keep indexes in one place** (schema.index() section) for maintainability

### Current Index Configuration

**ArchivedLPOEntry:**
- `{ date: -1 }` - Time-based queries
- `{ lpoNo: 1 }` - LPO lookups
- `{ archivedAt: -1 }` - Archive management
- `{ truckNo: 1, date: -1 }` - Truck history queries

**ArchivedLPOSummary:**
- `{ date: -1 }` - Time-based queries
- `{ lpoNo: 1 }` - LPO lookups
- `{ station: 1, year: 1 }` - Station reports
- `{ archivedAt: -1 }` - Archive management

**LPOEntry:**
- `{ date: 1 }` - Chronological queries
- `{ truckNo: 1 }` - Truck lookups
- `{ dieselAt: 1 }` - Station queries
- `{ doSdo: 1 }` - DO/SDO lookups
- `{ isDeleted: 1 }` - Soft delete filtering
- `{ isDriverAccount: 1 }` - Driver account filtering
- `{ referenceDo: 1 }` - Journey reference
- `{ paymentMode: 1 }` - Payment filtering
- `{ lpoNo: 1, date: -1 }` - **Compound**: LPO entries sorted by date
- `{ dieselAt: 1, date: -1 }` - Station history
- `{ truckNo: 1, referenceDo: 1 }` - NIL entry lookups

## Benefits

✅ **Performance:**
- Eliminated redundant indexes
- Reduced index storage overhead
- Faster write operations (fewer indexes to update)

✅ **Maintainability:**
- All indexes defined in one place (schema.index() section)
- Clear documentation of index purpose
- Easier to audit and optimize

✅ **No Warnings:**
- Clean startup logs
- Professional application output
- No misleading error messages

## Verification

After these changes, the Mongoose duplicate index warning should no longer appear. 

### Test
```bash
cd backend
npm start
```

**Expected output:**
```
Email service initialized successfully
R2 service is not configured. Backup functionality will be limited.
✓ No duplicate index warnings
```

## Related Files

The following files now have optimized indexes:
- `/backend/src/models/ArchivedData.ts` - Archive collection schemas
- `/backend/src/models/LPOEntry.ts` - LPO entry schema
- `/backend/src/models/LPOSummary.ts` - Already optimized (no changes needed)
- `/backend/src/models/DriverAccountEntry.ts` - Already optimized (no changes needed)

## Database Migration

**Note**: These changes only affect NEW collections. Existing indexes in your database are not automatically removed.

### Optional: Clean up existing indexes

If you want to remove old duplicate indexes from your production database:

```javascript
// In MongoDB shell or Compass
use your_database_name;

// View current indexes
db.lpoentries.getIndexes();

// Drop specific duplicate index if found
db.lpoentries.dropIndex("lpoNo_1");

// Mongoose will recreate the compound index on next startup
```

**⚠️ Caution**: Don't drop indexes during peak hours. The compound index will still serve single-field queries efficiently.

---

**Status**: ✅ **COMPLETE** - Duplicate index warning fixed
**Date**: December 10, 2025
**Impact**: Backend models only - no frontend changes needed
