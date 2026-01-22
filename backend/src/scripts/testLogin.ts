import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models';

const testLogin = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    const username = 'fuelorder';
    const passwordToTest = 'fuel123';

    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      console.log('❌ User not found');
      await mongoose.connection.close();
      return;
    }

    console.log('📝 User found:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password hash: ${user.password.substring(0, 20)}...`);
    console.log(`   isActive: ${user.isActive}`);
    console.log(`   isBanned: ${user.isBanned}`);
    console.log(`   isDeleted: ${user.isDeleted}\n`);

    // Test password
    const isMatch = await user.comparePassword(passwordToTest);
    console.log(`🔐 Testing password "${passwordToTest}": ${isMatch ? '✅ MATCH' : '❌ NO MATCH'}`);

    if (!isMatch) {
      console.log('\n🔧 Fixing password...');
      user.password = await bcrypt.hash(passwordToTest, 10);
      await user.save();
      console.log('✅ Password updated!');

      // Test again
      const userAgain = await User.findOne({ username }).select('+password');
      const isMatchNow = await userAgain!.comparePassword(passwordToTest);
      console.log(`🔐 Testing password "${passwordToTest}" again: ${isMatchNow ? '✅ MATCH' : '❌ NO MATCH'}`);
    }

    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

testLogin();
