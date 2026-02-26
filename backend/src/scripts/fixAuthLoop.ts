/**
 * Emergency Script: Fix Authentication Loop
 *
 * Clears mustChangePassword for ALL users so they can login normally.
 * Run this when users are stuck in the force-password-change / invalid-session loop.
 *
 * Usage:
 *   npx ts-node backend/src/scripts/fixAuthLoop.ts
 *   npx ts-node backend/src/scripts/fixAuthLoop.ts --dry-run   # preview only
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   EMERGENCY AUTH FIX — Clear mustChangePassword for all     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db!;
  const usersCol = db.collection('users');

  // 1. Show current state
  const totalUsers = await usersCol.countDocuments({ isDeleted: { $ne: true } });
  const affected = await usersCol.countDocuments({
    isDeleted: { $ne: true },
    mustChangePassword: true,
  });
  const affectedWithReset = await usersCol.countDocuments({
    isDeleted: { $ne: true },
    mustChangePassword: true,
    passwordResetAt: { $ne: null },
  });
  const affectedWithoutReset = await usersCol.countDocuments({
    isDeleted: { $ne: true },
    mustChangePassword: true,
    $or: [{ passwordResetAt: null }, { passwordResetAt: { $exists: false } }],
  });

  console.log(`Total active users        : ${totalUsers}`);
  console.log(`Users with flag = true     : ${affected}`);
  console.log(`  ├─ with passwordResetAt  : ${affectedWithReset}`);
  console.log(`  └─ without passwordResetAt: ${affectedWithoutReset}`);
  console.log();

  // 2. List affected users
  if (affected > 0) {
    const users = await usersCol
      .find(
        { isDeleted: { $ne: true }, mustChangePassword: true },
        { projection: { username: 1, role: 1, mustChangePassword: 1, passwordResetAt: 1, createdAt: 1 } }
      )
      .toArray();

    console.log('Affected users:');
    for (const u of users) {
      console.log(
        `  - ${u.username} (${u.role}) | passwordResetAt: ${u.passwordResetAt || 'null'} | created: ${u.createdAt}`
      );
    }
    console.log();
  }

  if (affected === 0) {
    console.log('✅ No users are stuck. Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (dryRun) {
    console.log('⚠️  DRY RUN — no changes made. Remove --dry-run to apply fix.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 3. Fix: clear the flag for ALL affected users
  const result = await usersCol.updateMany(
    { isDeleted: { $ne: true }, mustChangePassword: true },
    { $set: { mustChangePassword: false }, $unset: { passwordResetAt: '' } }
  );

  console.log(`✅ Fixed ${result.modifiedCount} user(s). mustChangePassword cleared.`);
  console.log();

  // 4. Verify
  const remaining = await usersCol.countDocuments({
    isDeleted: { $ne: true },
    mustChangePassword: true,
  });
  console.log(`Remaining users with flag = true: ${remaining}`);
  if (remaining === 0) {
    console.log('✅ All users can now login normally.');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
