import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { User } from '../models';

const seedSuperAdmin = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    const superAdminData = {
      username: 'superadmin',
      email: 'superadmin@tahmeed.com',
      password: 'admin123',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      department: 'IT',
      isActive: true,
    };

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
      username: superAdminData.username 
    });

    if (existingSuperAdmin) {
      console.log('📝 Super Admin already exists, updating...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(superAdminData.password, 10);
      
      // Update the existing super admin
      await User.findByIdAndUpdate(existingSuperAdmin._id, {
        ...superAdminData,
        password: hashedPassword,
      });
      
      console.log('✅ Super Admin updated successfully!\n');
    } else {
      console.log('📝 Creating Super Admin...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(superAdminData.password, 10);
      
      // Create super admin
      await User.create({
        ...superAdminData,
        password: hashedPassword,
      });
      
      console.log('✅ Super Admin created successfully!\n');
    }

    console.log('🔐 Super Admin Credentials:');
    console.log(`   Username: ${superAdminData.username}`);
    console.log(`   Password: ${superAdminData.password}`);
    console.log(`   Email: ${superAdminData.email}`);
    console.log(`   Role: ${superAdminData.role}\n`);
    
    console.log('💡 You can now login and create other users from the admin panel.');

    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding super admin:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedSuperAdmin();
