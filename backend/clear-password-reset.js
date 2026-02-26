const mongoose = require('mongoose');
require('dotenv').config();

async function clearPasswordReset() {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    
    const db = mongoose.connection.db;
    
    const result = await db.collection('users').updateOne(
      { username: 'Hamdu_Nassor' },
      {
        $set: {
          mustChangePassword: false,
          passwordResetAt: null
        }
      }
    );
    
    console.log('Modified:', result.modifiedCount, 'records');
    if (result.modifiedCount > 0) {
      console.log('✅ Password reset requirement cleared');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

clearPasswordReset();
