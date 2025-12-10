# Theme Fix Testing Guide

## Issue Fixed
User-specific theme preferences were not loading correctly on login/logout, causing themes to carry over between different user accounts.

## Changes Made

### 1. Login Flow Fix
- Now loads the **new user's theme** instead of keeping the previous user's theme
- Theme is applied immediately after successful login

### 2. Logout Flow Fix  
- Resets to **default theme** on logout
- Prevents theme from persisting to next user

### 3. Session Restore Fix
- Properly loads user-specific theme when restoring session from localStorage

## Before Testing - IMPORTANT CLEANUP

### Step 1: Clear Vite Cache
Already done! ✓

### Step 2: Clear Browser localStorage
**CRITICAL:** You must clear the old global theme key from localStorage:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run this command:
```javascript
localStorage.removeItem('fuel_order_theme');
```

4. Verify it's removed:
```javascript
console.log('Old key:', localStorage.getItem('fuel_order_theme')); // Should be null
```

### Step 3: Restart Dev Server (if running)
```bash
# Stop current dev server (Ctrl+C)
# Then restart:
cd /home/zakuwantungsten/Desktop/Fuel_Order/frontend
npm run dev
```

## Testing Scenarios

### Test 1: Single User Theme Persistence
1. **Login** as User A
2. **Set theme** to Dark Mode
3. **Logout**
4. **Login** as User A again
5. **Expected:** Dark mode should be active ✓

### Test 2: Multi-User Independent Themes
1. **Login** as User A
2. **Set theme** to Dark Mode
3. **Logout** (should reset to default)
4. **Login** as User B  
5. **Set theme** to Light Mode
6. **Logout** (should reset to default)
7. **Login** as User A again
8. **Expected:** Dark mode should be active (User A's preference) ✓
9. **Logout**
10. **Login** as User B again
11. **Expected:** Light mode should be active (User B's preference) ✓

### Test 3: Default Theme on Logout
1. **Login** as any user with a theme preference
2. **Logout**
3. **Expected:** Theme should reset to system default or light mode ✓

### Test 4: Theme Toggle During Session
1. **Login** as any user
2. **Toggle theme** multiple times
3. **Logout**
4. **Login** as the same user
5. **Expected:** Last selected theme should be active ✓

### Test 5: New User (No Theme Set)
1. **Login** as a brand new user (who has never set theme)
2. **Expected:** System default theme should be applied
3. **Set theme** to Dark
4. **Logout** and **Login** again
5. **Expected:** Dark mode should be remembered ✓

## How to Verify It's Working

### Check localStorage Keys
Open browser console and run:
```javascript
// List all theme keys
Object.keys(localStorage).filter(k => k.includes('theme'))

// Should see keys like:
// ["fuel_order_theme_user_1", "fuel_order_theme_user_2", "fuel_order_theme_default"]
// NOT: "fuel_order_theme"
```

### Check Current User's Theme
```javascript
const auth = JSON.parse(localStorage.getItem('fuel_order_auth'));
const userId = auth?.id;
const themeKey = `fuel_order_theme_user_${userId}`;
console.log('Current user theme key:', themeKey);
console.log('Current user theme:', localStorage.getItem(themeKey));
```

### Use Theme Debug Panel
If ThemeDebugPanel is enabled in your app:
- Look for "User ID" field - should show current logged-in user
- Look for "Theme Key" field - should show user-specific key
- Verify localStorage value matches selected theme

## Common Issues & Solutions

### Issue: Theme still carries over between users
**Solution:**
1. Clear ALL theme keys:
```javascript
Object.keys(localStorage).filter(k => k.includes('theme')).forEach(k => localStorage.removeItem(k));
```
2. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Restart dev server

### Issue: Theme not persisting
**Solution:**
1. Check browser console for errors
2. Verify you're logged in (user ID must exist)
3. Check localStorage for user-specific key

### Issue: Theme doesn't change immediately
**Solution:**
1. Check if dark/light toggle button is responding
2. Verify HTML element has/removes 'dark' class
3. Look for console errors in theme application

## Debug Commands

### Check all localStorage data
```javascript
console.table(
  Object.keys(localStorage).map(key => ({
    key,
    value: localStorage.getItem(key)?.substring(0, 50) + '...'
  }))
);
```

### Force set a user's theme
```javascript
const userId = 1; // Change to your user ID
localStorage.setItem(`fuel_order_theme_user_${userId}`, 'dark');
location.reload();
```

### Clear everything and start fresh
```javascript
localStorage.clear();
location.reload();
```

## Expected Behavior Summary

✅ Each user has independent theme preference  
✅ Theme persists across logout/login for same user  
✅ Theme resets to default on logout (before next login)  
✅ New users get system default theme  
✅ Theme changes are instant and visible  
✅ No interference between different user accounts  

## Files Modified

1. `/frontend/src/contexts/AuthContext.tsx` - Core login/logout/theme logic
2. `/frontend/src/components/ThemeDebugPanel.tsx` - Debug visualization (previous fix)

## Need Help?

If issues persist:
1. Share browser console logs
2. Show output of localStorage theme keys
3. Indicate which test scenario is failing
4. Check if you completed the cleanup steps above
