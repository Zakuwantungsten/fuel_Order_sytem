# Quick Start: Google Maps Fleet Tracking

## ⚡ 3-Step Setup

### Step 1: Get Google Maps API Key (5 minutes)
1. Go to https://console.cloud.google.com/
2. Create new project or select existing
3. Search "Maps JavaScript API" → Enable it
4. Go to Credentials → Create API Key
5. Copy the key (starts with AIza...)

### Step 2: Configure API Key
Choose one:

**Option A: Environment File**
```bash
cd frontend
echo "VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE" >> .env
```

**Option B: In-App** (easier)
- Just open Fleet Tracking page
- Paste key in the prompt
- Done!

### Step 3: Seed Checkpoints (One-time)
```bash
cd backend
npm run seed:checkpoints
```

## ✅ That's It!

Now you can:
1. Upload Excel fleet reports
2. See trucks on Google Maps
3. Click markers to copy truck lists

---

## 🎯 What You'll See

**Before Upload:**
- Empty map with 65 gray checkpoint markers
- Covering route from Mombasa to Kolwezi

**After Upload:**
- Blue circles (major checkpoints) with truck counts
- Green circles (minor checkpoints) with truck counts
- Click any circle to copy truck numbers
- Zoom/pan to explore the entire 2600km route

---

## 🆘 Troubleshooting

**Map not loading?**
→ Check API key is correct

**No markers?**
→ Run `npm run seed:checkpoints`

**No truck counts?**
→ Upload an Excel report first

**Copy not working?**
→ Click markers that have numbers (trucks present)

---

## 📱 Screenshots Reference

Your map will look like the image you shared:
- Colored circles at checkpoint locations
- Numbers inside showing truck counts
- Interactive click-to-copy functionality
- Clean, professional interface

**Enjoy your new fleet tracking map! 🗺️🚛**
