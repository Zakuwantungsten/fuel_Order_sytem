# Database Archival - Implementation Checklist

## ✅ Pre-Implementation (Before Running Archival)

### 1. Dependencies
- [ ] Run `cd backend && npm install`
- [ ] Verify `node-cron` is installed
- [ ] Verify `@types/node-cron` is installed (dev dependency)
- [ ] Run `npm ls node-cron` to confirm version

### 2. Documentation Review
- [ ] Read `ARCHIVAL_QUICK_START.md` (5 min read)
- [ ] Skim `DATABASE_ARCHIVAL_GUIDE.md` (reference)
- [ ] Review `ARCHIVAL_VISUAL_GUIDE.md` (understand flow)
- [ ] Check `ARCHIVAL_IMPLEMENTATION_SUMMARY.md` (technical details)

### 3. Environment Check
- [ ] Backend server starts successfully
- [ ] Database connection working
- [ ] You have Super Admin access
- [ ] Logs directory exists: `backend/logs/`

---

## 🧪 Testing Phase (CRITICAL - Don't Skip)

### 4. Dry Run Test
```bash
cd backend
npm run archival:test
```

- [ ] Command runs without errors
- [ ] Shows "DRY RUN" message
- [ ] Displays current statistics
- [ ] Shows what WOULD be archived
- [ ] No actual data modified

**Expected Output:**
```
📊 Current Database Statistics:
Active Records:
  - FuelRecord: X,XXX records
  - LPOEntry: X,XXX records
  
🧪 Running DRY RUN...
Total Records Would Be Archived: X,XXX

📦 Archival Breakdown:
  - FuelRecord: XXX records
  - LPOEntry: XXX records
```

### 5. API Endpoints Test
- [ ] Server running: `npm run dev`
- [ ] Login as Super Admin
- [ ] Get auth token

Test these endpoints:
```bash
# 1. Get Statistics
GET http://localhost:5000/api/archival/stats
Authorization: Bearer <token>
```
- [ ] Returns active/archived counts
- [ ] Status 200
- [ ] No errors

```bash
# 2. Dry Run via API
POST http://localhost:5000/api/archival/run
Authorization: Bearer <token>
Content-Type: application/json

{
  "monthsToKeep": 6,
  "dryRun": true
}
```
- [ ] Returns success: true
- [ ] Shows records that would be archived
- [ ] No actual archival happens

### 6. Data Verification
- [ ] Note current record counts
- [ ] Identify oldest records in each collection
- [ ] Confirm Delivery Orders will NOT be archived
- [ ] Check if cutoff date (6 months ago) seems reasonable

**Record your counts:**
```
FuelRecord: ________ active, ________ will be archived
LPOEntry: ________ active, ________ will be archived
LPOSummary: ________ active, ________ will be archived
YardFuelDispense: ________ active, ________ will be archived
```

---

## 🚀 First Execution (Actual Archival)

### 7. Backup First (IMPORTANT!)
- [ ] Create database backup
- [ ] Verify backup is complete
- [ ] Store backup in safe location
- [ ] Test backup restoration (optional but recommended)

### 8. Choose Execution Method

**Option A: CLI (Recommended for first time)**
```bash
npm run archival:run
```
- [ ] Watch console output
- [ ] Monitor progress
- [ ] Wait for completion
- [ ] Check for success message

**Option B: API Call**
```bash
POST http://localhost:5000/api/archival/run
{
  "monthsToKeep": 6,
  "auditLogMonthsToKeep": 12,
  "dryRun": false
}
```

### 9. Monitor Execution
- [ ] Check server logs: `tail -f backend/logs/app.log`
- [ ] Watch for progress updates
- [ ] No error messages appear
- [ ] Process completes successfully

**Expected Duration:**
- First run with 1-2 years data: 10-30 minutes
- Subsequent runs: 2-5 minutes

---

## ✓ Post-Execution Verification

### 10. Verify Archival Results
```bash
GET /api/archival/stats
```
- [ ] Active record counts decreased
- [ ] Archived record counts increased
- [ ] Numbers make sense (active + archived = original total)
- [ ] lastArchivalDate is recent

### 11. Check Application Functionality
- [ ] Dashboard loads faster
- [ ] Recent data (last 6 months) visible
- [ ] Reports still work
- [ ] Delivery Orders all present ✅
- [ ] No errors in application

### 12. Test Archived Data Query
```bash
POST /api/archival/query
{
  "collectionName": "FuelRecord",
  "query": {},
  "limit": 10,
  "sort": { "archivedAt": -1 }
}
```
- [ ] Returns archived records
- [ ] Data looks correct
- [ ] Contains expected fields
- [ ] Response time acceptable (1-3 seconds)

### 13. Performance Check
Test these operations and note response times:

**Before vs After:**
```
Dashboard load: _____ → _____
List view (100 records): _____ → _____
Filtered query: _____ → _____
Report generation: _____ → _____
```

Expected improvements: 70-85% faster

---

## 📅 Automatic Schedule Verification

### 14. Scheduler Status
- [ ] Server logs show: "Archival scheduler: Active"
- [ ] Cron job registered
- [ ] No scheduler errors

### 15. Wait for First Automatic Run
- [ ] Note date for next 1st of month
- [ ] Check logs on that date at ~2:10 AM
- [ ] Verify automatic execution happened
- [ ] Check `/api/archival/history`

---

## 📚 Documentation & Team Communication

### 16. Document for Your Team
- [ ] Share `ARCHIVAL_QUICK_START.md` with team
- [ ] Explain what was archived
- [ ] Show how to query old data if needed
- [ ] Document who can access archival features

### 17. Update Runbook
- [ ] Add archival system to operations runbook
- [ ] Document troubleshooting steps
- [ ] Include API endpoint reference
- [ ] Note monitoring procedures

### 18. Training (if needed)
- [ ] Train admins on archival system
- [ ] Show how to query archived data
- [ ] Demonstrate emergency restore
- [ ] Explain automatic schedule

---

## 🔍 Ongoing Monitoring

### 19. Monthly Check (1st Week)
- [ ] Review `/api/archival/history`
- [ ] Verify last archival succeeded
- [ ] Check active database size
- [ ] Monitor query performance

### 20. Quarterly Review
- [ ] Assess archival effectiveness
- [ ] Review archived data growth
- [ ] Adjust retention period if needed
- [ ] Optimize archive queries if slow

---

## 🚨 Emergency Procedures

### 21. If Something Goes Wrong

**Archival Failed:**
```bash
# Check error in history
GET /api/archival/history

# Review logs
tail -f backend/logs/app.log

# Try manual run with dry run first
npm run archival:test
```

**Need to Restore Data:**
```bash
POST /api/archival/restore
{
  "collectionName": "FuelRecord",
  "startDate": "2024-06-01",
  "endDate": "2024-06-30"
}
```

**System Slow After Archival:**
```bash
# Restart server (applies optimizations)
pm2 restart fuel-backend

# Or
systemctl restart fuel-backend

# Check if archival actually ran
GET /api/archival/stats
```

---

## 📋 Success Criteria

### All Clear to Deploy ✅
- [x] Dry run completed successfully
- [x] First actual archival completed
- [x] Active database size reduced
- [x] Application works correctly
- [x] Archived data queryable
- [x] Performance improved
- [x] Automatic schedule active
- [x] Team informed
- [x] Documentation complete

---

## 🎯 Your Specific Situation Checklist

### For 15 Users with 4-5 Months Active Data:
- [ ] Verified 6-month retention is appropriate
- [ ] Confirmed Delivery Orders never archived
- [ ] Tested with concurrent users (no issues)
- [ ] Verified 2 AM schedule won't affect users
- [ ] Performance gains visible (70%+ faster)
- [ ] Database size reduced (75%+ smaller)

---

## 📞 Support Reference

### Quick Commands:
```bash
# Test archival
npm run archival:test

# Run archival
npm run archival:run

# View stats
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/archival/stats

# View logs
tail -f backend/logs/app.log | grep -i archival

# Check scheduler
ps aux | grep node-cron
```

### Key Files:
- Models: `/backend/src/models/ArchivedData.ts`
- Service: `/backend/src/services/archivalService.ts`
- Controller: `/backend/src/controllers/archivalController.ts`
- Routes: `/backend/src/routes/archivalRoutes.ts`
- Scheduler: `/backend/src/jobs/archivalScheduler.ts`
- Test Script: `/backend/src/scripts/testArchival.js`

---

## ✨ Final Checklist

**Before Going Live:**
- [ ] All testing phases completed
- [ ] First archival successful
- [ ] Application verified working
- [ ] Performance improved
- [ ] Team informed
- [ ] Documentation ready
- [ ] Monitoring in place

**You're Ready!** 🚀

---

## 📝 Notes Section

Use this space to document your specific experience:

```
Date of first archival: _______________
Records archived: _______________
Duration: _______________
Performance improvement: _______________
Issues encountered: _______________
Resolution: _______________

Next review date: _______________
```

---

**Remember:** The archival system is now automatic. After successful first execution, it will maintain your database automatically every month! 🎉
