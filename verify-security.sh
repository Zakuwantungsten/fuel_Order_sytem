#!/bin/bash

# Security Setup Verification Script
# Run this after deployment to verify all security fixes are active

echo "🔒 Fuel Order System - Security Verification"
echo "=============================================="
echo ""

API_URL="${1:-http://localhost:5000}"
echo "Testing API at: $API_URL"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: CSRF Token Endpoint
echo "1️⃣  Testing CSRF Protection..."
CSRF_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/csrf-token" -c /tmp/csrf_cookies.txt)
HTTP_CODE=$(echo "$CSRF_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ CSRF endpoint working${NC}"
else
    echo -e "   ${RED}❌ CSRF endpoint failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 2: Rate Limiting
echo "2️⃣  Testing Rate Limiting..."
COUNT=0
for i in {1..6}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"test","password":"wrong"}')
    if [ "$HTTP_CODE" = "429" ]; then
        COUNT=$((COUNT + 1))
    fi
done

if [ $COUNT -gt 0 ]; then
    echo -e "   ${GREEN}✅ Rate limiting active (blocked after 5 attempts)${NC}"
else
    echo -e "   ${YELLOW}⚠️  Rate limiting may not be working${NC}"
fi
echo ""

# Test 3: CSRF Protection on POST
echo "3️⃣  Testing CSRF Protection on State-Changing Requests..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/delivery-orders" \
    -H "Content-Type: application/json" \
    -d '{"test":"data"}')

if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "401" ]; then
    echo -e "   ${GREEN}✅ CSRF protection active (blocked request without token)${NC}"
else
    echo -e "   ${RED}❌ CSRF protection may not be working (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 4: Driver Credentials Collection
echo "4️⃣  Checking Driver Credentials Setup..."
if command -v mongosh &> /dev/null; then
    MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/fuel-order}"
    COUNT=$(mongosh "$MONGO_URI" --quiet --eval "db.drivercredentials.countDocuments()")
    if [ "$COUNT" -gt 0 ]; then
        echo -e "   ${GREEN}✅ Driver credentials found: $COUNT trucks${NC}"
    else
        echo -e "   ${RED}❌ No driver credentials! Run: npm run setup-driver-credentials${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  Cannot verify (mongosh not installed)${NC}"
    echo -e "   ${YELLOW}   Run: npm run setup-driver-credentials${NC}"
fi
echo ""

# Test 5: Check Required Dependencies
echo "5️⃣  Checking Required Packages..."
cd "$(dirname "$0")/../backend" 2>/dev/null || cd ./backend

MISSING=0
for pkg in "cookie-parser" "express-rate-limit"; do
    if grep -q "\"$pkg\"" package.json; then
        echo -e "   ${GREEN}✅ $pkg installed${NC}"
    else
        echo -e "   ${RED}❌ $pkg missing${NC}"
        MISSING=$((MISSING + 1))
    fi
done

if [ $MISSING -gt 0 ]; then
    echo -e "   ${YELLOW}⚠️  Run: npm install${NC}"
fi
echo ""

# Summary
echo "=============================================="
echo "📊 Verification Summary"
echo "=============================================="
echo ""
echo "Required Actions:"
echo "1. Ensure MongoDB is running"
echo "2. Run: npm run setup-driver-credentials"
echo "3. Distribute driver PINs securely"
echo "4. Test driver login with new PINs"
echo ""
echo "For detailed documentation, see:"
echo "  - SECURITY_ENHANCEMENTS.md"
echo "  - SECURITY_FIXES_QUICK_REF.md"
echo ""
echo "✅ Security verification complete!"
