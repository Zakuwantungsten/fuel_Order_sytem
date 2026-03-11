/**
 * Seed SMTP credentials into the system_settings document so they appear
 * in the admin "Email Configuration" page and are used by EmailService.
 *
 * Usage (from backend/):
 *   npx ts-node -e "require('dotenv').config(); require('./src/scripts/seedEmailConfig')"
 * OR add an npm script and run:
 *   npm run seed:email
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { SystemConfig } from '../models';
import { encryptData } from '../utils/cryptoUtils';
import { isEncrypted } from '../utils/fieldEncryption';

const SMTP = {
  host:     process.env.SMTP_HOST     || 'smtp.gmail.com',
  port:     parseInt(process.env.SMTP_PORT || '587'),
  secure:   process.env.SMTP_SECURE === 'true',
  user:     process.env.SMTP_USER     || '',
  password: process.env.SMTP_PASS     || '',
  from:     process.env.EMAIL_FROM    || process.env.SMTP_USER || '',
  fromName: process.env.EMAIL_FROM_NAME || 'Tahmeed Fuel Order',
};

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }
  if (!SMTP.user || !SMTP.password) {
    console.error('❌  SMTP_USER / SMTP_PASS are not set in .env');
    process.exit(1);
  }

  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅  Connected\n');

  const existing = await SystemConfig.findOne({
    configType: 'system_settings',
    isDeleted: false,
  });

  if (existing) {
    console.log('📝  Existing system_settings document found — updating email config...');
    // Encrypt the password before storing (same as updateEmailConfiguration does)
    const encKey = process.env.FIELD_ENCRYPTION_KEY || '';
    const storedPassword = SMTP.password && encKey && !isEncrypted(SMTP.password)
      ? `encrypted:${encryptData(SMTP.password, encKey)}`
      : SMTP.password;

    existing.systemSettings = existing.systemSettings || ({} as any);
    existing.systemSettings!.email = { ...SMTP, password: storedPassword } as any;
    existing.lastUpdatedBy = 'seed-script';
    await existing.save();
    console.log('✅  Email configuration updated!\n');
  } else {
    console.log('📝  No system_settings document found — creating one...');
    const encKey = process.env.FIELD_ENCRYPTION_KEY || '';
    const storedPassword = SMTP.password && encKey && !isEncrypted(SMTP.password)
      ? `encrypted:${encryptData(SMTP.password, encKey)}`
      : SMTP.password;
    await SystemConfig.create({
      configType: 'system_settings',
      lastUpdatedBy: 'seed-script',
      systemSettings: { email: { ...SMTP, password: storedPassword } },
    });
    console.log('✅  system_settings document created with email config!\n');
  }

  console.log('📧  Seeded SMTP config:');
  console.log(`    Host     : ${SMTP.host}`);
  console.log(`    Port     : ${SMTP.port}`);
  console.log(`    Secure   : ${SMTP.secure}`);
  console.log(`    User     : ${SMTP.user}`);
  console.log(`    Password : ${'*'.repeat(SMTP.password.length)}`);
  console.log(`    From     : ${SMTP.from}`);
  console.log(`    FromName : ${SMTP.fromName}`);

  await mongoose.disconnect();
  console.log('\n✅  Done. Email config is now in MongoDB.');
};

run().catch((err) => {
  console.error('❌  Seed failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
