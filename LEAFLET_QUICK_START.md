# ⚡ Quick Start: Leaflet Fleet Tracking

## ✅ YOU'RE READY TO GO!

No setup needed - Leaflet is already configured and working.

---

## 🚀 3 Simple Steps

### 1. Start Your Servers

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:** (Already running at http://localhost:3001/)
```bash
cd frontend
npm run dev
```

### 2. Seed Checkpoints (One-time only)

```bash
cd backend
npm run seed:checkpoints
```

This adds GPS coordinates to all 65 checkpoints.

### 3. Upload Fleet Report

1. Open http://localhost:3001/
2. Login and go to **Fleet Tracking**
3. Click **Upload Report**
4. Select your Excel file
5. Watch the map populate! 🗺️

---

## 🎯 What You'll See

**The Map:**
- OpenStreetMap base layer (like Google Maps but free)
- 65 checkpoint markers across East Africa
- Blue circles = Major checkpoints with trucks
- Green circles = Minor checkpoints with trucks
- Gray circles = Empty checkpoints

**Click Any Marker:**
- Popup shows checkpoint name and truck count
- Click the marker to copy truck list
- "Copied!" appears when successful
- Paste into your LPO forms

---

## 📍 Route Coverage

Your map shows the complete route:
- **Kenya**: Taveta, Mombasa
- **Tanzania**: Tanga → Dar es Salaam → Mbeya → Tunduma
- **Zambia**: Nakonde → Ndola → Kitwe → Chililabombwe
- **DRC**: Kasumbalesa → Lubumbashi → Likasi → Kolwezi

---

## 🎨 Map Controls

**Zoom:**
- Scroll wheel to zoom in/out
- +/- buttons in top-left corner

**Pan:**
- Click and drag to move around
- Double-click to zoom in

**Reset View:**
- Refresh page to return to default center

---

## ✨ Features

✅ **No API key** - Works out of the box  
✅ **Free forever** - OpenStreetMap is open-source  
✅ **Click to copy** - Instant truck list clipboard  
✅ **Responsive** - Works on desktop and tablet  
✅ **Real-time** - Updates when you upload new reports  
✅ **Color-coded** - Easy to spot major vs minor checkpoints  

---

## 🆘 Troubleshooting

**Map shows but no markers?**
→ Run `npm run seed:checkpoints` in backend folder

**Markers show but no truck counts?**
→ Upload an Excel fleet report first

**Can't copy trucks?**
→ Only blue/green markers have trucks (click those)

**Map not loading?**
→ Check browser console for errors
→ Ensure port 3001 is accessible

---

## 📱 Mobile Support

The map is responsive and works on tablets. For best experience:
- Use landscape mode
- Pinch to zoom
- Tap markers to see details

---

**Enjoy your free, open-source fleet tracking map! 🎉**

No bills. No limits. No API keys. Just works.
