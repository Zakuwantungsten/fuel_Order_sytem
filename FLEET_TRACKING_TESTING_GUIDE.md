# Fleet Tracking Testing Guide

## ✅ Setup Complete - Ready for Testing

### What's Been Done

1. **✅ Backend Dependencies Installed**
   - `multer` - File upload handling
   - `exceljs` - Excel parsing

2. **✅ Backend Server Running**
   - Server running on port 5000
   - MongoDB connected
   - WebSocket active
   - Email service initialized

3. **✅ Checkpoint Seed Script Created**
   - Script location: `backend/src/scripts/seedCheckpoints.ts`
   - Run with: `npm run seed:checkpoints`
   - Seeds 58 checkpoints from Mombasa/DSM to DRC

4. **✅ Frontend No Errors**
   - All TypeScript compilation clean
   - Components properly imported
   - Permissions configured

---

## 🧪 Manual Testing Required

### Test 1: Seed Checkpoints
```bash
# In a new terminal (separate from running backend)
cd backend
npm run seed:checkpoints

# Expected output:
# ✅ Connected to MongoDB
# 🗑️  Deleted X existing checkpoints
# ✅ Successfully seeded 58 checkpoints
# 📊 Total checkpoints in database: 58
# 🚩 First checkpoint: Mombasa Port (Order: 1)
# 🏁 Last checkpoint: Kinshasa (Order: 58)
```

**Alternative: Seed via API (requires login)**
```bash
# 1. Login first
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"super@admin.com","password":"YourPassword"}'

# 2. Copy the token from response, then:
curl -X POST http://localhost:5000/api/checkpoints/seed \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

### Test 2: Start Frontend
```bash
cd frontend
npm run dev

# Should open at http://localhost:5173
```

---

### Test 3: Access Fleet Tracking Page

**Steps:**
1. Login as `fuel_order_maker`, `admin`, or `super_admin`
2. Check sidebar - should see "Fleet Tracking" menu item with truck icon
3. Click "Fleet Tracking"
4. Should see empty state: "No Fleet Reports Yet"

**Expected:**
- ✅ Menu item visible for authorized roles
- ✅ Page loads without errors
- ✅ Empty state displays properly
- ✅ Upload button is visible

**Not Expected to See:**
- ❌ 404 error
- ❌ Permission denied
- ❌ Component not found errors

---

### Test 4: Verify Checkpoints Loaded

**Option A: Via MongoDB Compass**
```
Database: fuel_order
Collection: checkpoints
Expected: 58 documents
```

**Option B: Via API**
```bash
# Login first, then:
curl http://localhost:5000/api/checkpoints \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return array of 58 checkpoints
```

**Option C: Via Browser DevTools**
```javascript
// In browser console on Fleet Tracking page:
fetch('http://localhost:5000/api/checkpoints', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(data => console.log(`Checkpoints loaded: ${data.length}`))
```

---

### Test 5: Upload Excel File

**Prepare Test File:**
1. Create Excel file with one of these formats:

**Format 1: IMPORT Report (Multi-table)**
```
Sheet 1:
     Fleet 1 GOING
TRUCK   ROUTE   CURRENT POSITION
T123    KE-DRC  Mombasa Port
T456    TZ-DRC  Lusaka
T789    KE-ZM   Nakonde

     Fleet 2 GOING  
TRUCK   ROUTE   CURRENT POSITION
T111    KE-DRC  Chalinze
T222    TZ-ZM   Mpika

     Fleet 1 RETURNING
TRUCK   ROUTE   CURRENT POSITION
T333    -       Lubumbashi
T444    -       Kolwezi
```

**Format 2: NO_ORDER Report (Simple)**
```
NO.  TRUCK NUMBER  ROUTE  CURRENT POSITION
1    T123          -      Mombasa Port
2    T456          -      Lusaka
3    T789          -      Nakonde
```

**Testing Steps:**
1. Go to Fleet Tracking page
2. Click "Upload Report" button
3. Select your test Excel file
4. Wait for upload to complete

**Expected Results:**
- ✅ Upload progress shown
- ✅ File parsed successfully
- ✅ Timeline appears with checkpoints
- ✅ Truck counts shown at checkpoints
- ✅ Snapshot selector shows uploaded report

**Check for:**
- Trucks appear at correct checkpoints
- Counts are accurate
- Direction badges (GOING/RETURNING) are correct

---

### Test 6: Copy Truck List

**Steps:**
1. After uploading a file with trucks
2. Find a checkpoint with trucks (e.g., "Mombasa Port")
3. Click "Copy Trucks" button
4. Button should change to "Copied!" briefly
5. Paste into notepad (Ctrl+V)

**Expected Results:**
- ✅ Comma-separated list: "T123, T456, T789"
- ✅ Button shows success feedback
- ✅ Clipboard contains truck numbers
- ✅ Can paste into LPO form or any text field

**Test Different Formats:**
```javascript
// In browser console:
const checkpointName = 'Mombasa Port';
const snapshotId = 'SNAPSHOT_ID_FROM_DROPDOWN';

// Test comma format
fetch(`http://localhost:5000/api/fleet-tracking/checkpoint/${checkpointName}/copy?format=comma&snapshotId=${snapshotId}`, {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(data => console.log('Comma:', data.text))

// Test line format
fetch(`http://localhost:5000/api/fleet-tracking/checkpoint/${checkpointName}/copy?format=line&snapshotId=${snapshotId}`, {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(data => console.log('Line:', data.text))
```

---

### Test 7: Permission Enforcement

**Test as Different Roles:**

| Role | Should See Menu? | Can Upload? | Can View? | Can Copy? |
|------|------------------|-------------|-----------|-----------|
| fuel_order_maker | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| admin | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| super_admin | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| viewer | ❌ No | ❌ No | ❌ No | ❌ No |
| driver | ❌ No | ❌ No | ❌ No | ❌ No |
| clerk | ❌ No | ❌ No | ❌ No | ❌ No |

**How to Test:**
1. Login as each role
2. Check if "Fleet Tracking" appears in sidebar
3. Try to access `/fleet-tracking` directly
4. Verify appropriate access/denial

---

### Test 8: Multiple Snapshots

**Steps:**
1. Upload first Excel file
2. Note the timestamp in snapshot selector
3. Upload second Excel file (different data)
4. Snapshot selector should show 2 items
5. Switch between snapshots
6. Verify timeline updates correctly

**Expected:**
- ✅ Can switch between snapshots
- ✅ Truck positions update correctly
- ✅ Counts reflect selected snapshot
- ✅ Copy function uses selected snapshot

---

### Test 9: Checkpoint Fuzzy Matching

**Create test Excel with variations:**
```
TRUCK   POSITION
T123    MOMBASA PORT        # Should match "Mombasa Port"
T456    mombasa             # Should match "Mombasa Port"
T789    Dar Es Salaam       # Should match "Dar Es Salaam Port"
T111    DSM                 # Should match "Dar Es Salaam Port" (alternative name)
T222    Lusaka ZM           # Should match "Lusaka" (alternative name)
```

**Expected:**
- ✅ All variations match correctly
- ✅ Trucks appear at correct checkpoints
- ✅ No "Unknown checkpoint" errors in console

---

### Test 10: Dark Mode

**Steps:**
1. Open Fleet Tracking page
2. Toggle dark mode (moon/sun icon in header)
3. Verify all elements are readable

**Check:**
- ✅ Text is visible in both modes
- ✅ Checkpoint cards have proper contrast
- ✅ Truck badges are readable
- ✅ Buttons have proper styling
- ✅ No white text on white background (or vice versa)

---

## 🐛 Known Issues to Watch For

### Issue: "Cannot find module 'multer'"
**Solution:** Dependencies installed, but if error persists:
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Issue: Checkpoints not seeding
**Solution:** Run seed script manually:
```bash
cd backend
npm run seed:checkpoints
```

### Issue: Upload fails with "Network Error"
**Check:**
1. Backend is running on port 5000
2. CORS is configured correctly
3. File size is reasonable (<10MB)

### Issue: Copy button doesn't work
**Check:**
1. Browser clipboard permissions
2. HTTPS vs HTTP (some browsers block clipboard on HTTP)
3. Try different format: `?format=line`

### Issue: Trucks not appearing at checkpoints
**Debug:**
```javascript
// In browser console:
fetch('/api/fleet-tracking/latest', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(data => {
  console.log('Total trucks:', data.totalTrucks);
  console.log('Distribution:', data.checkpointDistribution);
})
```

---

## 📊 Success Criteria

All tests pass when:

- [x] ✅ Dependencies installed without errors
- [x] ✅ Backend running on port 5000
- [ ] ✅ 58 checkpoints seeded successfully
- [x] ✅ Frontend compiles without errors
- [ ] ✅ Fleet Tracking menu appears for authorized roles
- [ ] ✅ Can upload Excel files
- [ ] ✅ Timeline displays correctly
- [ ] ✅ Copy feature works
- [ ] ✅ Permissions enforced properly
- [ ] ✅ Dark mode works

---

## 🚀 Next Steps After Testing

Once all tests pass:

1. **Create Sample Excel Files**
   - Add to `backend/assets/examples/` folder
   - Document formats in README

2. **User Training**
   - Demo the copy feature
   - Show how to prepare Excel files
   - Explain checkpoint matching

3. **Monitoring**
   - Check backend logs for parsing errors
   - Monitor MongoDB for checkpoint data quality
   - Track file upload success rates

4. **Documentation**
   - Update user manual with screenshots
   - Create video tutorial
   - Add FAQ section

---

## 📝 Testing Checklist

Copy this checklist and mark items as you test:

```
Setup:
[ ] Backend dependencies installed
[ ] Backend server running
[ ] Frontend server running
[ ] Checkpoints seeded (58 total)

Basic Functionality:
[ ] Can access Fleet Tracking page
[ ] Empty state shows correctly
[ ] Upload button works
[ ] File uploads successfully
[ ] Timeline renders
[ ] Checkpoints display in order

Core Features:
[ ] Trucks appear at correct checkpoints
[ ] Truck counts are accurate
[ ] Copy button copies to clipboard
[ ] Comma format works
[ ] Line format works
[ ] Can paste into LPO form

Advanced:
[ ] Multiple snapshots work
[ ] Can switch between snapshots
[ ] Fuzzy matching works
[ ] Direction badges correct
[ ] Dark mode works
[ ] Responsive on mobile

Permissions:
[ ] fuel_order_maker can access
[ ] admin can access
[ ] super_admin can access
[ ] Other roles cannot access
[ ] Direct URL access blocked for unauthorized

Edge Cases:
[ ] Large file (>100 trucks) uploads
[ ] Invalid Excel file rejected
[ ] Empty Excel file handled
[ ] Duplicate truck numbers handled
[ ] Unknown checkpoint handled gracefully
```

---

## 🆘 Support

If you encounter issues:

1. **Check Logs:**
   ```bash
   # Backend logs
   tail -f backend/logs/combined.log
   
   # Browser console
   F12 → Console tab
   ```

2. **Database Check:**
   ```bash
   mongo
   use fuel_order
   db.checkpoints.count()
   db.fleetsnapshots.count()
   ```

3. **Restart Everything:**
   ```bash
   # Stop backend (Ctrl+C)
   # Stop frontend (Ctrl+C)
   
   # Clear and restart
   cd backend && npm run dev
   cd frontend && npm run dev
   ```

---

**Testing Started:** [Your date here]  
**Testing Completed:** [Your date here]  
**Tested By:** [Your name here]  
**Status:** 🟡 Pending Manual Testing
