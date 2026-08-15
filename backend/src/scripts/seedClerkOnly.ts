import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models';

async function seedClerkOnly() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ username: 'clerk' });
  if (existing) {
    existing.isActive = true;
    existing.isDeleted = false;
    existing.role = 'clerk' as any;
    existing.password = 'clerk123';
    if (!existing.firstName) existing.firstName = 'Jane';
    if (!existing.lastName) existing.lastName = 'Clerk';
    if (!existing.email) existing.email = 'clerk@tahmeed.com';
    (existing as any).mustChangePassword = false;
    await existing.save();
    console.log(`UPDATED clerk → role=${existing.role} email=${existing.email} id=${existing._id}`);
  } else {
    const created = await User.create({
      username: 'clerk',
      email: 'clerk@tahmeed.com',
      password: 'clerk123',
      firstName: 'Jane',
      lastName: 'Clerk',
      role: 'clerk',
      department: 'Administration',
      isActive: true,
    });
    console.log(`CREATED clerk → role=${created.role} id=${created._id}`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

seedClerkOnly().catch((err) => {
  console.error(err);
  process.exit(1);
});
