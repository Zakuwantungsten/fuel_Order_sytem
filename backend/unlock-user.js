const mongoose = require('mongoose');
require('dotenv').config();

async function unlockUser() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel-order';
    console.log('Connecting to:', uri.substring(0, 50) + '...');
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    
    const db = mongoose.connection.db;
    
    // Update the user record
    const result = await db.collection('users').updateOne(
      { username: 'Hamdu_Nassor' },
      {
        $set: {
          lockedUntil: null,
          failedLoginAttempts: 0
        }
      }
    );
    
    console.log('Update result:', result);
    console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
    
    if (result.modifiedCount > 0) {
      console.log('✅ Account unlocked successfully');
    } else {
      console.log('❌ User not found or already unlocked');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

unlockUser();
