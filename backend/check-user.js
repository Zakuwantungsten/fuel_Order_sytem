const mongoose = require('mongoose');
require('dotenv').config();

async function checkUserState() {
  try {
    const uri = process.env.MONGODB_URI;
    console.log('Connecting to database...');
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ username: 'Hamdu_Nassor' });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log('✅ User found:');
    console.log('  Username:', user.username);
    console.log('  mustChangePassword:', user.mustChangePassword);
    console.log('  passwordResetAt:', user.passwordResetAt);
    console.log('  isActive:', user.isActive);
    console.log('  isBanned:', user.isBanned);
    console.log('  lockedUntil:', user.lockedUntil);
    console.log('  failedLoginAttempts:', user.failedLoginAttempts);
    console.log('  Created:', user.createdAt);
    
    // Now clear the flags if needed
    if (user.mustChangePassword || user.passwordResetAt) {
      console.log('\n📝 Clearing password reset flags...');
      const result = await db.collection('users').updateOne(
        { username: 'Hamdu_Nassor' },
        {
          $set: {
            mustChangePassword: false,
            passwordResetAt: null
          }
        }
      );
      console.log('✅ Updated:', result.modifiedCount, 'record(s)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUserState();
