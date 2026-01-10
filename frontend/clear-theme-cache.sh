#!/bin/bash

echo "🧹 Clearing Fuel Order Theme Cache..."
echo ""

# Clear Vite cache
echo "1. Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf dist
echo "   ✓ Vite cache cleared"

# Clear browser localStorage (instructions)
echo ""
echo "2. Clear browser localStorage:"
echo "   Open browser console (F12) and run:"
echo "   ----------------------------------------"
echo "   // Remove old global theme key"
echo "   localStorage.removeItem('fuel_order_theme');"
echo ""
echo "   // List all theme keys to verify"
echo "   Object.keys(localStorage).filter(k => k.includes('theme'));"
echo "   ----------------------------------------"
echo ""

echo "3. Restart dev server:"
echo "   npm run dev"
echo ""

echo "✨ Cache clearing steps listed above!"
