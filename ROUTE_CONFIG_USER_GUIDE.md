# Route Configuration Management - User Guide

## 🎯 Overview
Fuel Order Makers can now manage route configurations directly from the Delivery Orders page, allowing them to add, edit, and delete destination fuel allocations without admin intervention.

## 📍 Access

**Location:** Delivery Orders Page → **"Routes Config"** button (purple button in the top action bar)

```
[Export] [Amended DOs] [Routes Config] [Bulk Create] [New DO]
                           ↑
                   Click here to manage routes
```

## ✨ Features

### 1. **Add New Route**

**Steps:**
1. Click **"Routes Config"** button
2. In the blue "Add New Route" section:
   - Enter destination name (e.g., `KOLWEZI`)
   - Enter total liters (e.g., `2400`)
3. Click **"Add"**

**Result:** Route is saved and will be used automatically for future DOs

**Example:**
```
Destination: BUKAVU
Liters: 2350
[Add Button] → Saved! ✅
```

### 2. **Edit Existing Route**

**Steps:**
1. Find the route in the list
2. Click **"Edit"** button
3. Modify the liters value
4. Click the **Save icon (✓)**

**Use Case:** Fuel requirements changed for a destination

**Example:**
```
KOLWEZI: 2400L → Change to 2450L
```

### 3. **Delete Route**

**Steps:**
1. Find the route in the list
2. Click the **Trash icon (🗑️)**
3. Confirm deletion

**Warning:** Deleted routes will revert to default 2200L allocation

### 4. **Search Routes**

**Feature:** Filter routes by destination name

**Use:**
```
Search box: "KOL" → Shows: KOLWEZI, etc.
```

## 🚀 Workflow Integration

### Scenario A: Creating DO for Unknown Destination

**Without Route Config:**
```
1. Create DO for "KIVU"
2. ⚠️ Warning popup: "Unknown destination"
3. Enter custom liters manually
4. Optionally save for future use
```

**With Route Config:**
```
1. Click "Routes Config"
2. Add: KIVU → 2300L
3. Close modal
4. Create DO for "KIVU" → Uses 2300L automatically ✅
```

### Scenario B: Updating Fuel Requirements

**Situation:** Company policy changes KOLWEZI from 2400L to 2450L

**Steps:**
```
1. Click "Routes Config"
2. Find KOLWEZI in list
3. Click "Edit"
4. Change 2400 → 2450
5. Click Save
6. All future DOs use new value ✅
```

## 📊 Current Routes (Default)

| Destination | Liters | Notes |
|------------|--------|-------|
| LUBUMBASHI | 2100 | Standard |
| LUBUMBASH | 2100 | Alternative spelling |
| LIKASI | 2200 | Standard |
| KAMBOVE | 2220 | Standard |
| FUNGURUME | 2300 | Standard |
| KINSANFU | 2360 | Far distance |
| LAMIKAL | 2360 | Far distance |
| KOLWEZI | 2400 | Far distance |
| KAMOA | 2440 | Mining site |
| KALONGWE | 2440 | Mining site |
| LUSAKA | 1900 | Zambia route |
| **Default** | **2200** | Any unlisted destination |

## 💡 Best Practices

### 1. **Use Consistent Naming**
```
✅ Good: KOLWEZI, KAMOA, LUBUMBASHI
❌ Bad: kolwezi, Kamoa, LubumbashI
```
**Tip:** System auto-converts to UPPERCASE

### 2. **Document Special Routes**
When adding unusual routes, inform team about:
- Why this allocation is different
- Any special considerations

### 3. **Regular Review**
Periodically check routes for:
- Outdated allocations
- Duplicate entries (different spellings)
- Unused routes

### 4. **Save Custom Routes**
When system prompts for custom liters:
- **Always choose "Save"** if this route will be used again
- Helps build comprehensive route database

## 🔧 Troubleshooting

### Issue: "Route not saving"
**Check:**
- Destination name is not empty
- Liters value is between 1-5000
- Browser allows localStorage

### Issue: "Can't find my route"
**Solutions:**
- Use search box to filter
- Check spelling (case-insensitive)
- Route might be spelled differently

### Issue: "Route deleted by accident"
**Recovery:**
- Re-add the route manually
- Use default 2200L temporarily
- Check with team for correct allocation

## 📱 Visual Guide

### Route Management Interface

```
┌─────────────────────────────────────────────────────┐
│ 🗺️  Route Configuration                      [X]   │
│ Manage destination fuel allocations                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ➕ Add New Route                                    │
│ ┌──────────────────┬─────────┬─────────┐          │
│ │ Destination...   │ Liters  │ [Add]   │          │
│ └──────────────────┴─────────┴─────────┘          │
│                                                      │
│ Search routes...                                    │
│ ┌──────────────────────────────────────┐          │
│ │ 🔍                                    │          │
│ └──────────────────────────────────────┘          │
│                                                      │
│ Routes List:                                        │
│ ┌──────────────────────────────────────────────┐  │
│ │ 📍 KOLWEZI              ⛽ 2,400 L           │  │
│ │                         [Edit] [🗑️]         │  │
│ ├──────────────────────────────────────────────┤  │
│ │ 📍 KAMOA                ⛽ 2,440 L           │  │
│ │                         [Edit] [🗑️]         │  │
│ └──────────────────────────────────────────────┘  │
│                                                      │
│ 💡 Tip: Routes not listed use default 2200L        │
└─────────────────────────────────────────────────────┘
```

## 🎓 Training Checklist

For new fuel order makers:

- [ ] Know where "Routes Config" button is located
- [ ] Can add a new route successfully
- [ ] Can edit an existing route
- [ ] Can search for routes
- [ ] Understand what happens with unlisted destinations
- [ ] Know how to handle unknown destination popup

## 🔐 Permissions

**Who Can Access:**
- ✅ Fuel Order Makers (primary users)
- ✅ Admins (full access)
- ✅ Super Admins (full access)

**Who Cannot:**
- ❌ Drivers (view only their assigned DOs)
- ❌ Yard Personnel (different workflow)

## 📞 Support

**Need Help?**
1. Check this guide first
2. Ask team lead about route allocations
3. Contact system admin for technical issues

**Report Issues:**
- Routes not saving
- Incorrect fuel calculations
- System errors

## 🆕 Recent Updates

**Version Info:**
- Added fuzzy matching for typo tolerance
- Added route suggestions for unknown destinations
- Improved search functionality
- Enhanced UI with dark mode support

---

**Quick Access:** From any Delivery Orders page → **"Routes Config"** button (purple, with map icon)
