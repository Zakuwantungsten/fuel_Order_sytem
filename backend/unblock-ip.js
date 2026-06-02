/**
 * Dev helper: unblock an IP (or IPs) that the firewall auto-blocked, and
 * optionally allowlist a dev subnet so phones on the LAN aren't re-blocked.
 *
 * Usage:
 *   node unblock-ip.js                      # clears the default dev IPs below
 *   node unblock-ip.js 192.168.4.55         # clears a specific IP
 *   node unblock-ip.js 192.168.4.55 --allow-subnet 192.168.0.0/16
 *
 * After running, RESTART the backend so the in-memory block cache is flushed.
 */
const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

// Some ISP/local resolvers refuse SRV lookups needed by mongodb+srv:// URIs.
// Force a public resolver so the SRV record for Atlas resolves.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {
  /* ignore */
}

function normalizeIP(ip) {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

async function main() {
  const args = process.argv.slice(2);
  const allowIdx = args.indexOf('--allow-subnet');
  let allowSubnet = null;
  if (allowIdx !== -1) {
    allowSubnet = args[allowIdx + 1];
    args.splice(allowIdx, 2);
  }

  // IPs to clear: from CLI, or sensible dev defaults.
  const ips = (args.length ? args : ['192.168.4.55']).map(normalizeIP);

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fuel-order';
  console.log('Connecting to:', uri.substring(0, 50) + '...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  for (const ip of ips) {
    // Match both the bare and IPv6-mapped forms just in case.
    const ipVariants = [ip, `::ffff:${ip}`];

    const blocked = await db.collection('blockedips').updateMany(
      { ip: { $in: ipVariants }, isActive: true },
      { $set: { isActive: false, unblockedAt: new Date(), unblockedBy: 'dev:unblock-ip.js' } }
    );
    console.log(`[${ip}] BlockedIP deactivated: ${blocked.modifiedCount}`);

    const rules = await db.collection('iprules').deleteMany({
      ip: { $in: ipVariants },
      type: 'block',
    });
    console.log(`[${ip}] IPRule block entries removed: ${rules.deletedCount}`);
  }

  if (allowSubnet) {
    const exists = await db.collection('iprules').findOne({
      ip: allowSubnet,
      type: 'allow',
      isActive: true,
    });
    if (!exists) {
      await db.collection('iprules').insertOne({
        ip: allowSubnet,
        type: 'allow',
        description: 'Dev LAN allowlist (mobile testing)',
        isActive: true,
        createdBy: 'dev:unblock-ip.js',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Allow rule added for subnet: ${allowSubnet}`);
    } else {
      console.log(`Allow rule already present for subnet: ${allowSubnet}`);
    }
  }

  console.log('\nDone. RESTART the backend to flush the in-memory block cache.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
