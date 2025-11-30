# Quick Testing Guide - Delivery Order Print/PDF

## ✅ What's Fixed

1. **TO field** now shows **Client Name** (not Import/Export)
2. **WEIGHT field** now shows **Tonnages** correctly 
3. **Delivers Name** now shows **Driver Name** correctly
4. **Black document** issue fixed - prints properly now
5. **Tahmeed Logo** added to top-right corner

## 🧪 Test Scenarios

### Test 1: Print Single DO (DO Management)
```
1. Go to "Delivery Orders" page
2. Find any delivery order in the list
3. Click the "Eye" icon (👁️) to view
4. In the modal, click "Print" button
5. Browser print dialog opens
6. Select "Save as PDF" or your printer
7. ✅ Verify: Clean document with correct fields
```

**Expected Result:**
- Professional delivery note with border
- Tahmeed logo in top-right
- TO field shows client name (e.g., "RELOAD", "KOLWEZI")
- Weight shows tonnage (e.g., "28 TONS")
- Driver name appears in "Delivers Name" field

---

### Test 2: Bulk Create with PDF Download
```
1. Go to "Delivery Orders" page
2. Click "Bulk Create" button
3. Fill in common information:
   - Date: Today's date (auto-filled)
   - Type: DO or SDO
   - Client: RELOAD
   - Loading Point: DAR YARD
   - Destination: TANGA
   - Haulier: KOLWEZI

4. Paste this sample data:
   T424 EAF	T947 XZS	SALIM OMAR SHARIFF	28	210
   T525 BCG	T856 YWT	JOHN DOE	30	210
   T636 CDH	T765 XVU	JANE SMITH	25	210

5. Click "Parse Data"
6. Click "Create 3 DOs"
7. ✅ PDF downloads automatically
```

**Expected Result:**
- 3 DOs created (e.g., DO-7069, DO-7070, DO-7071)
- PDF file downloads: `DO-7069-7071.pdf`
- Each DO on separate page in PDF
- All fields correctly mapped
- Logo visible on each page

---

### Test 3: Re-download PDF
```
1. After Test 2 completes
2. Stay in the bulk creation modal
3. Scroll to bottom
4. Click "Download PDF Again" button
5. ✅ PDF downloads again with same content
```

---

## 🔍 Field Mapping Verification

Check these specific fields when viewing/printing:

| Label | Should Show | Example |
|-------|-------------|---------|
| **DO #** | DO-7069 or SDO-7069 | DO-7069 |
| **Date** | Order date | 29-11-2025 |
| **TO** | Client name | RELOAD |
| **POL** | Loading point | DAR YARD |
| **For Destination** | Destination | TANGA |
| **Haulier** | Haulier company | KOLWEZI |
| **Lorry No** | Truck number | T424 EAF |
| **Trailer No** | Trailer number | T947 XZS |
| **WEIGHT** | Tonnage + TONS | 28<br/>TONS |
| **Rate** | $XXX PER TON | $210 PER TON |
| **Delivers Name** | Driver name | SALIM OMAR SHARIFF |

---

## 🖨️ Browser Print Options

### Chrome/Edge
1. Right-click → Print
2. Or Ctrl+P (Cmd+P on Mac)
3. Destination: "Save as PDF" or printer
4. Click "Print" or "Save"

### Firefox
1. File → Print
2. Or Ctrl+P (Cmd+P on Mac)
3. Select "Microsoft Print to PDF" or printer
4. Click "Print"

---

## ❗ Common Issues & Solutions

### Issue: Logo not showing
**Solution**: Logo file is at `/frontend/src/assets/tahmeed-logo.svg` - should load automatically

### Issue: PDF download doesn't start
**Solution**: 
1. Check browser's download permissions
2. Use "Download PDF Again" button
3. Check browser console for errors

### Issue: Fields are blank
**Solution**: 
- Ensure data is filled when creating DO
- Check that truck number, tonnage, driver name are provided

### Issue: Print preview is black
**Solution**: This is now fixed! Should show white background with borders

---

## 📱 Quick Command Reference

### Start Frontend (if not running)
```bash
cd /home/zakuwantungsten/Desktop/Fuel_Order/frontend
npm run dev
```

### Start Backend (if not running)
```bash
cd /home/zakuwantungsten/Desktop/Fuel_Order/backend
npm run dev
```

### View in Browser
```
http://localhost:3000
```

---

## ✨ What to Look For

### ✅ Good Signs
- Clean white document with black borders
- Tahmeed logo visible in top-right
- All fields populated correctly
- Professional formatting
- Tonnages in WEIGHT column
- Driver name at bottom
- Rate shown as "$XXX PER TON"

### ❌ Red Flags
- Black background
- Missing borders
- TO field shows "IMPORT" or "EXPORT"
- Empty tonnage field
- Driver name missing
- Logo not loading

---

## 📞 Need Help?

If something doesn't work:
1. Check browser console (F12) for errors
2. Verify both frontend and backend are running
3. Try refreshing the page (Ctrl+R)
4. Check the detailed guide: `DO_PRINT_PDF_FIX.md`

---

**Ready to test!** Start with Test 1 (single DO print) then move to Test 2 (bulk creation).
