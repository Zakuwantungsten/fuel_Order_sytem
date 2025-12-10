/**
 * Theme Cache Cleanup Utility
 * Run this in browser console to clean up old theme keys
 * 
 * Usage: Copy and paste this entire script into browser console (F12)
 */

console.log('🧹 Fuel Order Theme Cache Cleanup\n');

// 1. Find all theme-related keys
const allKeys = Object.keys(localStorage);
const themeKeys = allKeys.filter(key => key.includes('theme'));

console.log('Found theme keys:', themeKeys);

// 2. Remove old global theme key
const oldKey = 'fuel_order_theme';
if (localStorage.getItem(oldKey)) {
  console.log(`❌ Removing old global key: ${oldKey}`);
  localStorage.removeItem(oldKey);
} else {
  console.log(`✓ Old global key not found: ${oldKey}`);
}

// 3. Show remaining user-specific theme keys
const userThemeKeys = allKeys.filter(key => key.startsWith('fuel_order_theme_user_'));
console.log('\n📋 User-specific theme keys:', userThemeKeys);

userThemeKeys.forEach(key => {
  const value = localStorage.getItem(key);
  const userId = key.replace('fuel_order_theme_user_', '');
  console.log(`   User ${userId}: ${value}`);
});

// 4. Optional: Clear ALL theme keys (uncomment to use)
/*
console.log('\n⚠️  Clearing ALL theme keys...');
themeKeys.forEach(key => {
  localStorage.removeItem(key);
  console.log(`   Removed: ${key}`);
});
console.log('✓ All theme keys cleared');
*/

console.log('\n✨ Cleanup complete!');
console.log('💡 Tip: Refresh the page to see changes');
