/**
 * Emergency IP unblock script.
 *
 * Clears auto-blocklist state that is locking users out of production:
 *   1. Deactivates BlockedIP records (the fail2ban-style auto-blocklist)
 *   2. Deactivates auto-gated IPRule block rules (created by IP gating)
 *
 * Manual admin-created IPRules are left untouched unless --include-manual.
 *
 * Usage (on the server):
 *   npm run unblock-ips                 # clear ALL active auto-blocks
 *   npm run unblock-ips -- 41.222.x.x   # clear blocks for one IP only
 *   npm run unblock-ips -- --include-manual
 *
 * The running backend re-syncs its in-memory blocklist from the DB every
 * 60 seconds (authoritative rebuild), so blocks lift within a minute —
 * no restart required. Restarting the backend applies it immediately.
 */

import { BlockedIP } from '../models/BlockedIP';
import { IPRule } from '../models/IPRule';

export async function unblockIPs(options: { ip?: string; includeManualRules?: boolean } = {}): Promise<void> {
  const blockFilter: any = { isActive: true };
  if (options.ip) blockFilter.ip = options.ip;

  const active = await BlockedIP.find(blockFilter).select('ip reason blockedAt expiresAt blockedBy').lean();
  if (active.length === 0) {
    console.log('No active auto-blocks found' + (options.ip ? ` for ${options.ip}` : '') + '.');
  } else {
    console.log(`Active auto-blocks (${active.length}):`);
    for (const b of active) {
      console.log(`  ${b.ip}  reason=${b.reason}  blockedAt=${b.blockedAt?.toISOString?.() ?? b.blockedAt}  expiresAt=${b.expiresAt ? new Date(b.expiresAt).toISOString() : 'PERMANENT'}  by=${b.blockedBy}`);
    }
    const result = await BlockedIP.updateMany(blockFilter, {
      isActive: false,
      unblockedAt: new Date(),
      unblockedBy: 'script:unblock-ips',
    });
    console.log(`Deactivated ${result.modifiedCount} BlockedIP record(s).`);
  }

  // Auto-gated persistent block rules (IP gating escalates auto-blocks into IPRules)
  const ruleFilter: any = options.includeManualRules
    ? { type: 'block', isActive: true }
    : { type: 'block', isActive: true, createdBy: 'system:ip-gating' };
  if (options.ip) ruleFilter.ip = options.ip;

  const rules = await IPRule.find(ruleFilter).select('ip description createdBy').lean();
  if (rules.length === 0) {
    console.log('No matching block IPRules found.');
  } else {
    console.log(`Block IPRules to deactivate (${rules.length}):`);
    for (const r of rules) {
      console.log(`  ${r.ip}  by=${r.createdBy}  ${r.description}`);
    }
    const result = await IPRule.updateMany(ruleFilter, { isActive: false });
    console.log(`Deactivated ${result.modifiedCount} IPRule(s).`);
  }

  console.log('\nDone. The running backend picks this up within 60s (or restart it to apply immediately).');
}

// Standalone script wrapper
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongoose = require('mongoose');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const includeManualRules = args.includes('--include-manual');
  const ip = args.find(a => !a.startsWith('--'));

  console.log('Connecting to MongoDB...');
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      await unblockIPs({ ip, includeManualRules });
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error('Unblock failed:', err);
      mongoose.disconnect().finally(() => process.exit(1));
    });
}
