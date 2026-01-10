#!/bin/bash

# Test Email Configuration Script
# This script tests the email functionality of the Fuel Order System

echo "======================================"
echo "Email Configuration Test"
echo "======================================"
echo ""

# Get the API base URL
API_URL="http://localhost:5000/api"

# Check if backend is running
echo "1. Checking if backend server is running..."
if curl -s "$API_URL/health" > /dev/null 2>&1; then
    echo "   ✅ Backend server is running"
else
    echo "   ❌ Backend server is not running"
    echo "   Please start the backend with: cd backend && npm run dev"
    exit 1
fi

echo ""

# You need to be logged in as admin to test these endpoints
echo "2. Testing Email Configuration..."
echo "   (You'll need an admin token for this)"
echo ""
echo "   To get your admin token:"
echo "   - Log in to the application"
echo "   - Open browser DevTools (F12)"
echo "   - Go to Application/Storage → Local Storage"
echo "   - Copy the value of 'fuel_order_token'"
echo ""

# Prompt for token
read -p "   Enter your admin token (or press Enter to skip): " TOKEN

if [ -z "$TOKEN" ]; then
    echo "   ⚠️  Skipping authenticated email tests"
    echo ""
    echo "   Manual Test Steps:"
    echo "   -----------------"
    echo "   1. Log in to the admin dashboard"
    echo "   2. Go to User Management"
    echo "   3. Create a new test user with a valid email"
    echo "   4. Check the email inbox for welcome credentials"
    echo "   5. Try resetting a user's password"
    echo "   6. Check email inbox for password reset notification"
else
    echo ""
    echo "3. Testing email configuration endpoint..."
    CONFIG_RESPONSE=$(curl -s -X GET "$API_URL/admin/email/test-config" \
        -H "Authorization: Bearer $TOKEN")
    
    echo "   Response: $CONFIG_RESPONSE"
    echo ""
    
    echo "4. Sending test email..."
    read -p "   Enter email address to send test email to: " TEST_EMAIL
    
    if [ ! -z "$TEST_EMAIL" ]; then
        TEST_RESPONSE=$(curl -s -X POST "$API_URL/admin/email/send-test" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"$TEST_EMAIL\"}")
        
        echo "   Response: $TEST_RESPONSE"
        echo ""
        echo "   ✅ Check the inbox of $TEST_EMAIL"
    fi
fi

echo ""
echo "======================================"
echo "Email Configuration Summary"
echo "======================================"
echo ""
echo "Current Configuration (from .env):"
echo "  Host: smtp.gmail.com"
echo "  Port: 587"
echo "  User: mozaali254@gmail.com"
echo "  Secure: false (STARTTLS)"
echo ""
echo "Features Implemented:"
echo "  ✅ Welcome email on user creation"
echo "  ✅ Password reset email by admin"
echo "  ✅ HTML templates with branding"
echo "  ✅ Fallback to manual password display if email fails"
echo ""
echo "Next Steps:"
echo "  1. Test user creation workflow"
echo "  2. Test password reset workflow"
echo "  3. Verify emails arrive in inbox (check spam folder)"
echo "  4. Configure production SMTP settings before deployment"
echo ""
