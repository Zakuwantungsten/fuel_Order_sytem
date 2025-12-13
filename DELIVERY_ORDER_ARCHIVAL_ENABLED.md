# Delivery Order Archival - Now Enabled

## Overview
Previously, Delivery Orders were excluded from the archival system due to business requirements stating they must remain in the active database permanently. This has now been changed to **allow Delivery Orders to be archived** just like other collections.

## Changes Made

### 1. Frontend Updates (`ArchivalManagementTab.tsx`)

#### Collection Configuration
- **Removed**: Disabled flag from DeliveryOrder option
- **Changed**: Default retention from 0 months to **12 months**
- **Added**: DeliveryOrder to active collection list with full archival support

```typescript
// Before:
{ name: 'DeliveryOrder', label: 'Delivery Orders (NEVER ARCHIVED)', defaultMonths: 0, disabled: true }

// After:
{ name: 'DeliveryOrder', label: 'Delivery Orders', defaultMonths: 12 }
```

#### Default State
- **Changed**: DeliveryOrder now enabled by default
- **Changed**: Initial retention set to 12 months
- **Removed**: Filter that excluded disabled collections

#### User Interface
- **Replaced**: Warning about DeliveryOrders never being archived
- **Added**: General recommendation about configuring retention periods
- **Updated**: Archive browser now includes DeliveryOrder in collection dropdown

### 2. Backend Model (`ArchivedData.ts`)

#### New Model: ArchivedDeliveryOrder
- **Created**: Complete archived schema for Delivery Orders
- **Fields**: originalId, sn, date, importOrExport, doType, doNumber, truckNo, driverName, product, quantity, tare, gross, net, archivedAt, archivedReason
- **Indexes**: 
  - Combined index on `date` and `archivedAt`
  - Index on `doNumber` for quick lookups
  - Index on `originalId`, `importOrExport`, `truckNo`

```typescript
export interface IArchivedDeliveryOrder {
  originalId: mongoose.Types.ObjectId;
  sn: number;
  date: string;
  importOrExport: string;
  doType: string;
  doNumber: string;
  truckNo: string;
  driverName: string;
  product: string;
  quantity: number;
  tare: number;
  gross: number;
  net: number;
  archivedAt: Date;
  archivedReason: string;
  [key: string]: any;
}
```

### 3. Backend Service (`archivalService.ts`)

#### Import Updates
- **Added**: `ArchivedDeliveryOrder` to imports from `../models/ArchivedData`

#### Documentation Updates
- **Updated**: Service documentation to reflect that all collections can be archived
- **Removed**: Exception statement about DeliveryOrders never being archived
- **Changed**: Strategy description to mention configurable retention per collection

#### Default Collections List
- **Added**: `'DeliveryOrder'` to default collections array in `archiveOldData` method

#### Archival Logic
- **Added**: Complete DeliveryOrder archival block with:
  - Retention period retrieval from SystemConfig
  - Cutoff date calculation
  - Collection archival with proper model mapping
  - Skip logic if archival is disabled
  - Statistics tracking

```typescript
if (collections.includes('DeliveryOrder')) {
  const retentionMonths = await this.getCollectionRetention('DeliveryOrder', monthsToKeep);
  if (retentionMonths > 0) {
    const cutoffDate = new Date(now);
    cutoffDate.setMonth(now.getMonth() - retentionMonths);
    logger.info(`DeliveryOrder cutoff date: ${cutoffDate.toISOString()} (${retentionMonths} months)`);
    
    const deliveryOrderResult = await this.archiveCollection(
      'DeliveryOrder',
      DeliveryOrder,
      ArchivedDeliveryOrder,
      cutoffDate,
      initiatedBy,
      dryRun,
      batchSize
    );
    result.collectionsArchived['DeliveryOrder'] = deliveryOrderResult;
    result.totalRecordsArchived += deliveryOrderResult.recordsArchived;
  } else {
    logger.info('DeliveryOrder archival is disabled, skipping');
  }
}
```

#### Query Support
- **Added**: DeliveryOrder case to `queryArchivedData` switch statement
- **Maps to**: `ArchivedDeliveryOrder` model for querying

#### Statistics Support
- **Added**: DeliveryOrder count queries (both active and archived)
- **Added**: DeliveryOrder to total archived records calculation
- **Added**: DeliveryOrder to returned stats objects

### 4. Backend Controller (`archivalController.ts`)

**Note**: Controller already had DeliveryOrder support including:
- Type definition in collection name union type
- Excel export headers configuration
- Data row formatting for exports
- No changes needed

## Configuration Details

### Default Retention Settings
- **Fuel Records**: 6 months
- **LPO Entries**: 6 months
- **LPO Documents**: 6 months
- **Yard Fuel Dispenses**: 6 months
- **Delivery Orders**: **12 months** ← NEW
- **Audit Logs**: 12 months

### Per-Collection Control
Super Admins can now:
1. **Enable/Disable** DeliveryOrder archival via toggle
2. **Configure retention** from 1 to 60 months
3. **View statistics** for active vs archived DeliveryOrders
4. **Browse/search** archived DeliveryOrders
5. **Export** unified data including archived DeliveryOrders
6. **Restore** archived DeliveryOrders if needed (emergency feature)

## Benefits

### Performance Improvements
- Reduced active database size for large DO datasets
- Faster queries on active DeliveryOrders table
- Maintained historical data in separate archive collection

### Flexibility
- Longer retention (12 months default) for business-critical DOs
- Toggle on/off if business requirements change
- Easy restoration if archived data needs to return to active

### Consistency
- All collections now follow same archival pattern
- Unified management interface
- Consistent reporting and export capabilities

## Migration Notes

### Existing Data
- No immediate impact on current DeliveryOrders
- Archival only occurs when:
  1. Manual trigger is executed, or
  2. Scheduled monthly job runs (1st of month at 2:00 AM)
- First archival will move DOs older than 12 months (default)

### Testing Recommendations
1. **Dry Run First**: Test archival with `dryRun: true` flag
2. **Verify Counts**: Check statistics before/after archival
3. **Test Queries**: Ensure archived DO queries work properly
4. **Test Restoration**: Validate restore functionality
5. **Monitor Performance**: Measure query speed improvements

## API Impact

### Unchanged Endpoints
All existing archival endpoints support DeliveryOrder:
- `POST /api/archival/run` - Includes DeliveryOrder in collections
- `POST /api/archival/query` - Can query archived DeliveryOrders
- `GET /api/archival/stats` - Returns DeliveryOrder counts
- `POST /api/archival/restore` - Can restore DeliveryOrders
- `POST /api/archival/export` - Exports include DeliveryOrders

### Example API Call
```json
POST /api/archival/run
{
  "monthsToKeep": 12,
  "dryRun": false,
  "collections": ["DeliveryOrder"]
}
```

## UI Changes

### Configuration Tab
- DeliveryOrder now appears with active toggle (enabled by default)
- Retention slider: 1-60 months (default: 12)
- No special warnings or restrictions

### Overview Tab
- Statistics include DeliveryOrder active/archived counts
- Manual trigger includes DeliveryOrder when "All Collections" selected

### Archive Browser Tab
- DeliveryOrder available in collection dropdown
- Search by DO number, truck no, date, etc.
- Export to Excel includes DeliveryOrder data

### History Tab
- Shows DeliveryOrder archival execution logs
- Displays record counts per archival run

## Rollback Plan

If business requirements change and DeliveryOrders must never be archived:

1. **Disable via UI**: Toggle off DeliveryOrder archival in Configuration tab
2. **Restore Archived Data**: Use restore feature to move archived DOs back to active
3. **Code Rollback**: Revert changes in this file if needed

## Summary

Delivery Orders are now fully integrated into the archival system with:
- ✅ 12-month default retention period
- ✅ Enable/disable toggle per business needs
- ✅ Complete CRUD operations on archived data
- ✅ Performance benefits from smaller active dataset
- ✅ Full audit trail and history tracking
- ✅ Easy restoration if needed

**Status**: Ready for production use
**Date**: December 13, 2025
**Impact**: Low risk - can be disabled anytime, data can be restored
