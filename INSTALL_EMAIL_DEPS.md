# 📦 Install Email Service Dependencies

## Quick Install (Run this now!)

```bash
cd backend
npm install nodemailer
npm install --save-dev @types/nodemailer
```

## What This Installs

- **nodemailer**: Email sending library (production dependency)
- **@types/nodemailer**: TypeScript type definitions (dev dependency)

## After Installation

1. **Restart backend server**:
   ```bash
   npm run dev
   ```

2. **Configure SMTP** (optional):
   - Copy settings from `backend/.env.email.template`
   - Add to your `backend/.env` file
   - Restart server again

3. **Test email service**:
   - Login as super admin
   - Go to System Admin → Security Tab
   - Click "Test Connection"

## Verification

Check installation:
```bash
cd backend
npm list nodemailer
```

Should show:
```
fuel-order-backend@1.0.0
└── nodemailer@6.x.x
```

## That's It!

The email service will now work. If you don't configure SMTP, the system will still work - it just won't send emails.
