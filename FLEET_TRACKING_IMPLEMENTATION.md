# Fleet Tracking System Implementation

## Overview
Implemented a comprehensive fleet tracking system that allows fuel_order_maker and admin users to upload Excel reports of truck positions and visualize fleet distribution across route checkpoints.

## Key Features

### 1. Excel Report Parsing
- **Two Report Types Supported:**
  - `IMPORT` Reports: Multi-table format with fleet groups (Fleet 1, Fleet 2, etc.)
  - `NO_ORDER` Reports: Single-table format for returning trucks
- **Fuzzy Checkpoint Matching**: Handles variations in checkpoint names (e.g., "Mombasa" matches "MOMBASA Port")
- **58 Checkpoints**: Full route from Kenya/Tanzania → Zambia → DRC

### 2. Visual Timeline Display
- Horizontal timeline visualization of all checkpoints
- Major/Minor checkpoint differentiation
- Real-time truck count at each checkpoint
- Direction indicators (GOING/RETURNING)
- Color-coded truck badges

### 3. Copy Feature ⭐ (KEY FEATURE)
- **One-click copy** of truck numbers at any checkpoint
- Multiple export formats:
  - `comma`: Comma-separated (e.g., "T123, T456, T789")
  - `line`: Line-separated (each truck on new line)
  - `array`: JSON array format
  - `detailed`: Full details including direction and status
- Ideal for pasting into LPO forms

### 4. Snapshot Management
- Upload multiple fleet reports
- Switch between different snapshots
- View historical fleet positions
- Automatic parsing and storage

## Technical Architecture

### Backend (Node.js/Express/MongoDB)

#### Models (4 files)
1. **Checkpoint Model** (`backend/src/models/Checkpoint.ts`)
   - Stores route checkpoint information
   - Fields: name, alternativeNames, order, isActive, isMajor
   - Indexed for fast lookups

2. **FleetSnapshot Model** (`backend/src/models/FleetSnapshot.ts`)
   - Stores uploaded report metadata
   - Embedded FleetGroup schema
   - Checkpoint distribution map
   - Statistics: totalTrucks, totalGoing, totalReturning

3. **TruckPosition Model** (`backend/src/models/TruckPosition.ts`)
   - Individual truck position records
   - Links to DeliveryOrder and FuelRecord
   - Direction enum: GOING | RETURNING
   - Indexed on snapshotId and currentCheckpoint

4. **Updated Index** (`backend/src/models/index.ts`)
   - Exports all new models

#### Services (1 file)
1. **Fleet Report Parser** (`backend/src/services/fleetReportParser.ts`)
   - ExcelJS-based parsing
   - Multi-table extraction for IMPORT reports
   - Single-table extraction for NO_ORDER reports
   - Fuzzy checkpoint matching algorithm
   - Direction inference from fleet group names

#### Controllers (2 files)
1. **Checkpoint Controller** (`backend/src/controllers/checkpointController.ts`)
   - CRUD operations for checkpoints
   - Reordering endpoints
   - Seed data functionality (58 checkpoints)
   
2. **Fleet Tracking Controller** (`backend/src/controllers/fleetTrackingController.ts`)
   - File upload handler (multipart/form-data)
   - Snapshot queries
   - Truck position queries
   - **COPY endpoint**: `GET /api/fleet-tracking/checkpoint/:name/copy`

#### Routes (2 files + index)
1. **Checkpoint Routes** (`backend/src/routes/checkpointRoutes.ts`)
   ```
   GET    /api/checkpoints          - List all checkpoints
   GET    /api/checkpoints/:id      - Get single checkpoint
   POST   /api/checkpoints          - Create checkpoint
   PUT    /api/checkpoints/:id      - Update checkpoint
   DELETE /api/checkpoints/:id      - Delete checkpoint
   POST   /api/checkpoints/reorder  - Bulk reorder
   POST   /api/checkpoints/seed     - Seed 58 checkpoints
   ```

2. **Fleet Tracking Routes** (`backend/src/routes/fleetTrackingRoutes.ts`)
   ```
   POST   /api/fleet-tracking/upload                     - Upload Excel file
   GET    /api/fleet-tracking/snapshots                  - List snapshots
   GET    /api/fleet-tracking/snapshots/:id              - Get snapshot details
   GET    /api/fleet-tracking/snapshots/:id/trucks       - Get trucks in snapshot
   GET    /api/fleet-tracking/checkpoint/:name/trucks    - Trucks at checkpoint
   GET    /api/fleet-tracking/checkpoint/:name/copy      - ⭐ COPY FEATURE
   GET    /api/fleet-tracking/latest                     - Latest snapshot
   GET    /api/fleet-tracking/stats                      - Statistics
   ```

3. **Updated Routes Index** (`backend/src/routes/index.ts`)
   - Registered `/api/checkpoints` and `/api/fleet-tracking`

### Frontend (React/TypeScript)

#### Permissions & Access Control (2 files)
1. **Permissions Configuration** (`frontend/src/utils/permissions.ts`)
   - Added `FLEET_TRACKING` resource
   - Configured for roles:
     - `fuel_order_maker`: READ, CREATE, EXPORT
     - `admin`: READ, CREATE, UPDATE, DELETE, EXPORT
     - `super_admin`: Full access including MANAGE

2. **Enhanced Dashboard** (`frontend/src/components/EnhancedDashboard.tsx`)
   - Added Fleet Tracking to sidebar menus for:
     - fuel_order_maker
     - admin
     - boss
     - super_admin
   - Added to valid tabs for role validation
   - Added render case for FleetTracking component

#### Pages (1 file)
1. **Fleet Tracking Page** (`frontend/src/pages/FleetTracking.tsx`)
   - File upload UI with drag-and-drop zone
   - Snapshot selector dropdown
   - Horizontal timeline visualization
   - Checkpoint cards with truck counts
   - Copy buttons with success feedback
   - Empty state for first-time users
   - Dark mode support

#### Navigation (1 file)
1. **Layout Component** (`frontend/src/components/Layout.tsx`)
   - Added Truck icon import
   - Added Fleet Tracking navigation item with permission check

## User Workflow

### For Fuel Order Makers:
1. **Upload Report**
   - Navigate to Fleet Tracking page
   - Click "Upload Report" button
   - Select Excel file (IMPORT or NO_ORDER format)
   - System parses and stores snapshot

2. **View Fleet Positions**
   - Automatic display of latest snapshot
   - Switch between historical snapshots
   - View truck distribution across route

3. **Copy Trucks for LPO**
   - Find desired checkpoint on timeline
   - Click "Copy Trucks" button
   - Paste into LPO form
   - Trucks are comma-separated by default

### For Admins:
- All fuel_order_maker capabilities
- Plus: Ability to delete snapshots
- Plus: Access to checkpoint management
- Plus: Ability to reorder checkpoints

### For Super Admins:
- All admin capabilities
- Plus: Seed checkpoint data
- Plus: Full checkpoint CRUD
- Plus: System configuration access

## Checkpoint Route (58 Checkpoints)

### Origin Points
1. Mombasa Port (Kenya)
2. Dar Es Salaam Port (Tanzania)

### Major Checkpoints
- **Kenya**: Mlolongo, Athi River, Salama, Sultan Hamud, Makindu, Kiboko, Emali, Simba
- **Tanzania**: Chalinze, Vigwaza, Mkata, Mikumi, Iringa, Rujewa, Mbeya, Tunduma
- **Zambia**: Nakonde, Mpika, Serenje, Kapiri Mposhi, Kabwe, Chisamba, Lusaka, Chongwe
- **DRC**: Kolwezi, Likasi, Lubumbashi

### Full Route Order
See `backend/src/controllers/checkpointController.ts` for complete list with order numbers.

## API Usage Examples

### Upload Report
```bash
curl -X POST http://localhost:5000/api/fleet-tracking/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@fleet_report.xlsx"
```

### Get Latest Snapshot
```bash
curl http://localhost:5000/api/fleet-tracking/latest \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Copy Truck List (Comma Format)
```bash
curl "http://localhost:5000/api/fleet-tracking/checkpoint/Nakonde/copy?format=comma" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Copy Truck List (Line Format)
```bash
curl "http://localhost:5000/api/fleet-tracking/checkpoint/Lusaka/copy?format=line" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### List Trucks at Checkpoint
```bash
curl "http://localhost:5000/api/fleet-tracking/checkpoint/Mombasa/trucks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Environment Requirements

### Backend Dependencies
```json
{
  "multer": "^1.4.5-lts.1",      // File upload handling
  "exceljs": "^4.3.0"            // Excel parsing
}
```

### Frontend Dependencies
```json
{
  "axios": "^1.x.x",             // HTTP client
  "lucide-react": "^0.x.x"       // Icons (TruckIcon, MapPin, Copy, etc.)
}
```

## Database Indexes

### Checkpoint
- `name` (unique)
- `order` (for sorting)

### FleetSnapshot
- `uploadedAt` (descending, for latest queries)
- `reportType`

### TruckPosition
- `snapshotId` (for snapshot queries)
- `currentCheckpoint` (for checkpoint queries)
- `truckNumber` (for truck lookups)

## File Structure

```
backend/
├── src/
│   ├── models/
│   │   ├── Checkpoint.ts          ✅ NEW
│   │   ├── FleetSnapshot.ts       ✅ NEW
│   │   ├── TruckPosition.ts       ✅ NEW
│   │   └── index.ts               ✅ UPDATED
│   ├── services/
│   │   └── fleetReportParser.ts   ✅ NEW
│   ├── controllers/
│   │   ├── checkpointController.ts        ✅ NEW
│   │   └── fleetTrackingController.ts     ✅ NEW
│   └── routes/
│       ├── checkpointRoutes.ts    ✅ NEW
│       ├── fleetTrackingRoutes.ts ✅ NEW
│       └── index.ts               ✅ UPDATED

frontend/
├── src/
│   ├── pages/
│   │   └── FleetTracking.tsx      ✅ NEW
│   ├── components/
│   │   ├── EnhancedDashboard.tsx  ✅ UPDATED
│   │   └── Layout.tsx             ✅ UPDATED
│   └── utils/
│       └── permissions.ts         ✅ UPDATED
```

## Testing Checklist

### Backend Testing
- [ ] Upload IMPORT format Excel file
- [ ] Upload NO_ORDER format Excel file
- [ ] Verify checkpoint fuzzy matching
- [ ] Test COPY endpoint with all formats
- [ ] Verify snapshot creation and retrieval
- [ ] Test checkpoint CRUD operations
- [ ] Verify seed data creation (58 checkpoints)

### Frontend Testing
- [ ] Upload file as fuel_order_maker
- [ ] View timeline visualization
- [ ] Copy truck list and verify clipboard
- [ ] Switch between snapshots
- [ ] Verify permission checks
- [ ] Test dark mode support
- [ ] Verify responsive design

### Integration Testing
- [ ] End-to-end: Upload → View → Copy → Paste in LPO
- [ ] Multiple snapshots management
- [ ] Checkpoint reordering
- [ ] Empty state handling

## Known Limitations & Future Enhancements

### Current Limitations
1. No real-time updates (manual refresh needed)
2. No truck search functionality
3. No filtering by direction or status
4. No export of full snapshot data

### Planned Enhancements
1. **Real-time Updates**: WebSocket integration for live position updates
2. **Advanced Filtering**: Filter by truck number, direction, checkpoint range
3. **Analytics Dashboard**: Historical trends, checkpoint dwell time, route efficiency
4. **Map View**: Geographic visualization of checkpoints and truck positions
5. **Notifications**: Alert when trucks reach specific checkpoints
6. **Bulk Operations**: Copy multiple checkpoints at once
7. **Integration**: Link truck positions to active DOs and LPOs
8. **Mobile App**: Dedicated mobile interface for drivers

## Security Considerations

### Authorization
- All endpoints protected by JWT authentication
- Role-based access control enforced
- File upload restricted to authenticated users

### Input Validation
- File type validation (Excel only)
- Checkpoint name sanitization
- Truck number format validation

### Data Privacy
- Truck positions accessible only to authorized roles
- No sensitive data in checkpoint names
- Audit logs for all modifications

## Performance Optimization

### Database
- Indexed queries for fast lookups
- Compound indexes on frequently queried fields
- Pagination for large snapshot lists

### File Processing
- Streaming Excel parsing (memory efficient)
- Async processing for large files
- Progress feedback during upload

### Frontend
- Lazy loading of truck details
- Optimistic UI updates
- Debounced search inputs

## Maintenance Notes

### Checkpoint Data
- Seed data includes 58 checkpoints in correct order
- Use reorder endpoint to adjust checkpoint sequence
- Mark checkpoints inactive instead of deleting

### Snapshot Cleanup
- Consider implementing automatic archival (>90 days)
- Periodic cleanup of orphaned truck positions
- Backup snapshots before deletion

### Monitoring
- Track upload success/failure rates
- Monitor parsing errors and log details
- Alert on checkpoint matching failures

## Support & Troubleshooting

### Common Issues

**Upload fails with "Invalid file format"**
- Ensure file is .xlsx or .xls format
- Verify file is not corrupted
- Check for required headers in Excel

**Checkpoint not matching**
- Review alternative names configuration
- Check for typos in Excel file
- Add new alternative name if needed

**Copy button not working**
- Verify browser clipboard permissions
- Check network connectivity
- Ensure snapshot is selected

**Empty truck list despite having trucks**
- Verify checkpoint name spelling
- Check if snapshot loaded correctly
- Refresh page and try again

## Contributors
- Backend: Database models, API endpoints, Excel parsing
- Frontend: React components, permissions, navigation
- Documentation: Implementation guide, API reference

## Version History
- **v1.0.0** (2025-01-XX): Initial implementation
  - Basic file upload and parsing
  - Timeline visualization
  - Copy feature for truck lists
  - Role-based access control
