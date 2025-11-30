#!/bin/bash

echo "🧹 Fuel Order Cache Cleaner"
echo "=============================="

# Change to frontend directory
cd "$(dirname "$0")"

echo "📁 Current directory: $(pwd)"

# Stop any running dev server (if any)
echo "⏹️  Stopping any running processes..."
pkill -f "npm run dev" || true
pkill -f "vite" || true

# Clear npm cache
echo "🗑️  Clearing npm cache..."
npm cache clean --force

# Remove node_modules and lock file
echo "🗂️  Removing node_modules..."
rm -rf node_modules
rm -f package-lock.json

# Clear Vite cache
echo "⚡ Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite

# Reinstall dependencies
echo "📦 Reinstalling dependencies..."
npm install

# Clear browser-related caches that might interfere
echo "🌐 Clearing additional cache directories..."
rm -rf ~/.npm/_cacache
rm -rf ~/.cache/vite

echo ""
echo "✅ Cache clearing complete!"
echo ""
echo "🚀 To restart your dev server, run:"
echo "   npm run dev"
echo ""
echo "🌐 Open the cache-clear-debug.html file in your browser to:"
echo "   - Clear browser cache and localStorage"
echo "   - Test theme functionality"
echo ""
echo "📍 Debug file location:"
echo "   file://$(pwd)/cache-clear-debug.html"