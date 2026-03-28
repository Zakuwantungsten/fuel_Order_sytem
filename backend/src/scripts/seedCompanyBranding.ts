/**
 * One-time migration: upsert company branding fields into the existing
 * system_settings document so the SuperAdmin UI can display and edit them.
 *
 * Usage (run from backend/):
 *   npx ts-node -r tsconfig-paths/register src/scripts/seedCompanyBranding.ts
 *
 * Or add to package.json scripts:
 *   "seed:branding": "ts-node -r tsconfig-paths/register src/scripts/seedCompanyBranding.ts"
 *
 * The script is SAFE to re-run — it only sets fields that are currently empty/missing.
 * It never overwrites values you have already saved via the UI.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// ---------------------------------------------------------------------------
// ✏️  EDIT THESE before running the script
// ---------------------------------------------------------------------------
const BRANDING = {
  companyName:    'TAHMEED',                   // e.g. 'Tahmeed Coach Ltd'
  companyWebsite: 'www.tahmeedcoach.co.ke',    // e.g. 'www.tahmeedcoach.co.ke'
  companyEmail:   'info@tahmeedcoach.co.ke',   // e.g. 'accounts@tahmeedcoach.co.ke'
  companyPhone:   '+254 700 000 000',          // e.g. '+254 712 345 678'
};
// ---------------------------------------------------------------------------

async function run() {
  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('✅  Connected\n');

  // Lazy-import after mongoose is connected so models register correctly
  const { SystemConfig } = await import('../models/SystemConfig');

  const doc = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });

  if (!doc) {
    console.error('❌  No system_settings document found. Start the backend once first so it auto-creates one, then re-run this script.');
    process.exit(1);
  }

  // Ensure nested path exists
  if (!doc.systemSettings) {
    (doc as any).systemSettings = {};
  }
  if (!(doc.systemSettings as any).general) {
    (doc as any).systemSettings.general = {};
  }

  const g = ((doc.systemSettings as any).general) as Record<string, unknown>;
  let changed = false;

  const fields: Record<string, string> = {
    companyName:    BRANDING.companyName,
    companyWebsite: BRANDING.companyWebsite,
    companyEmail:   BRANDING.companyEmail,
    companyPhone:   BRANDING.companyPhone,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!g[key]) {
      g[key] = value;
      console.log(`  ✏️  Set ${key} = "${value}"`);
      changed = true;
    } else {
      console.log(`  ⏭️  Skipped ${key} (already set to "${g[key]}")`);
    }
  }

  // logoUrl — never overwrite if already set
  if (!g['logoUrl']) {
    g['logoUrl'] = '';
    console.log('  ✏️  Set logoUrl = "" (upload via SuperAdmin UI)');
    changed = true;
  } else {
    console.log('  ⏭️  Skipped logoUrl (already set)');
  }

  if (changed) {
    doc.markModified('systemSettings');
    doc.lastUpdatedBy = 'seed:branding';
    await doc.save();
    console.log('\n✅  Company branding saved to DB.');
  } else {
    console.log('\n✅  Nothing to update — all branding fields already set.');
  }

  await mongoose.disconnect();
  console.log('🔌  Disconnected.');
}

run().catch(err => {
  console.error('❌  Migration failed:', err);
  process.exit(1);
});
