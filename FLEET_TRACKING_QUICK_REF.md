# Fleet Tracking Quick Reference

## 🚀 Quick Start

### Backend Setup
```bash
cd backend
npm install multer exceljs
npm run dev
```

### Seed Checkpoints (First Time Only)
```bash
curl -X POST http://localhost:5000/api/checkpoints/seed \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Frontend Access
Navigate to: **Fleet Tracking** (in sidebar for fuel_order_maker, admin, super_admin)

---

## 📁 File Locations

### Backend
- **Models**: `backend/src/models/Checkpoint.ts`, `FleetSnapshot.ts`, `TruckPosition.ts`
- **Services**: `backend/src/services/fleetReportParser.ts`
- **Controllers**: `backend/src/controllers/checkpointController.ts`, `fleetTrackingController.ts`
- **Routes**: `backend/src/routes/checkpointRoutes.ts`, `fleetTrackingRoutes.ts`

### Frontend
- **Page**: `frontend/src/pages/FleetTracking.tsx`
- **Permissions**: `frontend/src/utils/permissions.ts`
- **Navigation**: `frontend/src/components/EnhancedDashboard.tsx`

---

## 🔑 Key API Endpoints

### Upload Fleet Report
```http
POST /api/fleet-tracking/upload
Content-Type: multipart/form-data
Body: file=report.xlsx
```

### Copy Truck List ⭐ MOST IMPORTANT
```http
GET /api/fleet-tracking/checkpoint/:name/copy?format=comma&snapshotId=:id
```

**Formats:**
- `comma` - "T123, T456, T789" ← Default, best for LPOs
- `line` - One truck per line
- `array` - JSON array
- `detailed` - Full truck details

### List Snapshots
```http
GET /api/fleet-tracking/snapshots
```

### Get Trucks in Snapshot
```http
GET /api/fleet-tracking/snapshots/:id/trucks
```

### Checkpoint Management
```http
GET    /api/checkpoints              # List all
POST   /api/checkpoints/seed         # Load 58 checkpoints
POST   /api/checkpoints/reorder      # Bulk reorder
```

---

## 👥 User Roles & Permissions

| Role | Upload | View | Copy | Delete | Manage Checkpoints |
|------|--------|------|------|--------|-------------------|
| fuel_order_maker | ✅ | ✅ | ✅ | ❌ | ❌ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| super_admin | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 📊 Excel Report Formats

### IMPORT Report (Multi-table)
```
Fleet 1 GOING                Fleet 2 GOING               Fleet 1 RETURNING
TRUCK   ROUTE   POSITION    TRUCK   ROUTE   POSITION    TRUCK   ROUTE   POSITION
T123    TZ-DRC  Mombasa     T456    KE-ZM   Lusaka      T789    -       Nakonde
```

### NO_ORDER Report (Single-table)
```
NO.  TRUCK NUMBER  ROUTE  CURRENT POSITION
1    T123          -      Mombasa
2    T456          -      Lusaka
```

**Checkpoint Matching:**
- Case-insensitive
- Fuzzy matching (e.g., "Mombasa" matches "MOMBASA Port")
- Alternative names supported

---

## 🎯 Common Tasks

### 1. Upload a Fleet Report
1. Click **"Upload Report"** button
2. Select Excel file (.xlsx or .xls)
3. Wait for parsing confirmation
4. View trucks on timeline

### 2. Copy Trucks for LPO
1. Find checkpoint on timeline
2. Click **"Copy Trucks"** button
3. See "Copied!" confirmation
4. Paste into LPO form (Ctrl+V)

### 3. View Historical Positions
1. Use **snapshot selector** dropdown
2. Choose date/time
3. Timeline updates automatically

### 4. Add New Checkpoint (Admin Only)
```bash
curl -X POST http://localhost:5000/api/checkpoints \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Checkpoint",
    "alternativeNames": ["Alt Name 1", "Alt Name 2"],
    "order": 59,
    "isMajor": false
  }'
```

---

## 🗺️ Route Checkpoints (58 Total)

### Kenya → Tanzania → Zambia → DRC

**Origin Points:**
1. Mombasa Port (Kenya)
2. Dar Es Salaam Port (Tanzania)

**Key Checkpoints:**
- Mlolongo, Athi River, Sultan Hamud, Makindu, Emali (Kenya)
- Chalinze, Mikumi, Iringa, Mbeya, Tunduma (Tanzania)
- Nakonde, Mpika, Serenje, Kapiri Mposhi, Kabwe, Lusaka (Zambia)
- **Final Destinations:** Kolwezi, Likasi, Lubumbashi (DRC)

Full list: See `backend/src/controllers/checkpointController.ts` - seed method

---

## 🐛 Troubleshooting

### Issue: Upload fails
**Solution:**
- Check file format (.xlsx or .xls only)
- Verify file has correct headers
- Check file size (<10MB recommended)

### Issue: Checkpoint not matching
**Solution:**
- Add alternative name via checkpoint API
- Check spelling in Excel file
- Verify checkpoint exists in database

### Issue: Copy button doesn't work
**Solution:**
- Check browser clipboard permissions
- Try different format (`?format=line`)
- Refresh page and retry

### Issue: No trucks showing
**Solution:**
- Verify snapshot is selected
- Check console for errors
- Ensure Excel was parsed correctly

---

## 💡 Tips & Best Practices

### For Fuel Order Makers:
- **Upload daily reports** to track fleet movement
- **Use comma format** when copying to LPO forms
- **Check multiple checkpoints** before creating bulk orders
- **Verify truck numbers** before finalizing LPO

### For Admins:
- **Seed checkpoints once** at system setup
- **Don't delete snapshots** - they're historical records
- **Review parsing errors** in server logs
- **Add alternative names** for checkpoint variations

### Performance:
- **Large files (>5MB)** may take 10-30 seconds to parse
- **Pagination recommended** for >100 snapshots
- **Keep browser tab active** during upload

---

## 🔐 Security Notes

- All endpoints require authentication
- File uploads validated (Excel only)
- Role-based access strictly enforced
- Sensitive data not exposed in URLs

---

## 📈 Analytics (Coming Soon)

Future features:
- Historical truck movement trends
- Checkpoint dwell time analysis
- Route efficiency metrics
- Predictive arrival times
- Real-time position updates

---

## 🆘 Support

### Check Logs
```bash
# Backend logs
tail -f backend/logs/combined.log

# Parsing errors
grep "Excel parsing" backend/logs/error.log
```

### Database Queries
```javascript
// Check checkpoint count
db.checkpoints.count()

// View latest snapshot
db.fleetsnapshots.findOne({}, {sort: {uploadedAt: -1}})

// Find trucks at checkpoint
db.truckpositions.find({currentCheckpoint: "Lusaka"})
```

---

## 📚 Related Documentation

- **Full Implementation**: `FLEET_TRACKING_IMPLEMENTATION.md`
- **Planning Document**: `FLEET_TRACKING_IMPLEMENTATION_PLAN.md`
- **Research**: `FLEET_TRACKING_VISUALIZATION_RESEARCH_AND_PLAN.md`
- **API Docs**: See individual route files

---

## ✅ Implementation Checklist

### Backend
- [x] Checkpoint model
- [x] FleetSnapshot model
- [x] TruckPosition model
- [x] Excel parser service
- [x] Checkpoint CRUD API
- [x] Fleet tracking API
- [x] Copy endpoint with formats
- [x] Seed checkpoint data
- [x] Route registration

### Frontend
- [x] FleetTracking page component
- [x] Permission configuration
- [x] Sidebar navigation
- [x] File upload UI
- [x] Timeline visualization
- [x] Copy functionality
- [x] Snapshot selector
- [x] Dark mode support

### Testing Needed
- [ ] Upload IMPORT format
- [ ] Upload NO_ORDER format
- [ ] Copy to clipboard
- [ ] Permission enforcement
- [ ] Error handling
- [ ] Responsive design
- [ ] Dark mode
- [ ] Multiple snapshots

---

**Last Updated:** January 2025  
**Version:** 1.0.0  
**Status:** ✅ Ready for Testing
