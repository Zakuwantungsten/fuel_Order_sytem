const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e){}
const mongoose = require('mongoose');
require('dotenv').config();
async function run() {
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  for (const username of ['mkalisefu','sarahani_seif']) {
    const u = await db.collection('users').findOne({ username });
    if (!u) { console.log(`\n[${username}] NOT FOUND`); continue; }
    console.log(`\n[${username}] mustChangePassword=${u.mustChangePassword} pendingActivation=${u.pendingActivation} passwordResetAt=${u.passwordResetAt} tempExpires=${u.tempPasswordExpiresAt} updatedAt=${u.updatedAt}`);
  }
  await mongoose.disconnect(); process.exit(0);
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
