/**
 * Seed Firewall Defaults
 *
 * Seeds the database with:
 *   1. Common blocked path rules (FirewallPathRule collection)
 *   2. Common honeypot trap paths (firewall_configs: honeypot_config)
 *   3. Comprehensive bot User-Agent blocklist (firewall_configs: bot_protection)
 *
 * Usage (from backend/):
 *   npx ts-node -e "require('dotenv').config(); require('./src/scripts/seedFirewallDefaults')"
 * Or:
 *   npm run seed:firewall
 *
 * Safe to re-run — uses upsert / skip-if-exists logic.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { FirewallPathRule } from '../models/FirewallPathRule';
import { FirewallConfig } from '../models/FirewallConfig';

/* ══════════════════════════════════════════════════════════════════════════
 *  BLOCKED PATH RULES
 * ══════════════════════════════════════════════════════════════════════════ */

interface PathRuleSeed {
  pattern: string;
  action: 'block' | 'log';
  description: string;
}

const BLOCKED_PATHS: PathRuleSeed[] = [
  // ── Sensitive config / secrets ──────────────────────────────────────────
  { pattern: '/.env',               action: 'block', description: 'Environment file exposure attempt' },
  { pattern: '/.env.*',             action: 'block', description: 'Environment file variants (.env.local, .env.production, etc.)' },
  { pattern: '/config/*',           action: 'block', description: 'Generic config directory traversal' },
  { pattern: '/wp-config.php',      action: 'block', description: 'WordPress config file' },
  { pattern: '/configuration.php',  action: 'block', description: 'Joomla config file' },
  { pattern: '/settings.py',        action: 'block', description: 'Django settings file' },
  { pattern: '/app/config/*',       action: 'block', description: 'App config directory traversal' },
  { pattern: '/application/config/*', action: 'block', description: 'CodeIgniter config directory' },
  { pattern: '/config.inc.php',     action: 'block', description: 'Generic PHP config probe' },
  { pattern: '/database.yml',       action: 'block', description: 'Rails database credentials file' },
  { pattern: '/secrets.yml',        action: 'block', description: 'Secrets file exposure attempt' },
  { pattern: '/*.json',             action: 'log',   description: 'JSON file access — log only (package.json, etc.)' },

  // ── WordPress attack surface ─────────────────────────────────────────────
  { pattern: '/wp-admin/*',         action: 'block', description: 'WordPress admin panel probing' },
  { pattern: '/wp-login.php',       action: 'block', description: 'WordPress login brute-force attempt' },
  { pattern: '/wp-includes/*',      action: 'block', description: 'WordPress core includes exposure' },
  { pattern: '/wp-content/*',       action: 'log',   description: 'WordPress content directory — log only' },
  { pattern: '/xmlrpc.php',         action: 'block', description: 'WordPress XML-RPC brute-force / DDoS vector' },
  { pattern: '/wp-cron.php',        action: 'block', description: 'WordPress cron job abuse' },
  { pattern: '/wordpress/*',        action: 'block', description: 'WordPress installation directory probe' },

  // ── PHP database admin tools ─────────────────────────────────────────────
  { pattern: '/phpMyAdmin/*',       action: 'block', description: 'phpMyAdmin panel probe' },
  { pattern: '/phpmyadmin/*',       action: 'block', description: 'phpMyAdmin panel probe (lowercase)' },
  { pattern: '/pma/*',              action: 'block', description: 'phpMyAdmin alias probe' },
  { pattern: '/adminer*',           action: 'block', description: 'Adminer DB tool probe' },
  { pattern: '/Adminer*',           action: 'block', description: 'Adminer DB tool probe (capitalised)' },
  { pattern: '/myadmin/*',          action: 'block', description: 'Generic DB admin panel probe' },
  { pattern: '/sql*',               action: 'block', description: 'SQL panel / dump probe' },
  { pattern: '/*.sql',              action: 'block', description: 'SQL dump file exposure' },

  // ── Version control exposure ─────────────────────────────────────────────
  { pattern: '/.git/*',             action: 'block', description: 'Git repository exposure' },
  { pattern: '/.gitignore',         action: 'block', description: 'Git ignore file probe' },
  { pattern: '/.svn/*',             action: 'block', description: 'Subversion repository exposure' },
  { pattern: '/.hg/*',              action: 'block', description: 'Mercurial repository exposure' },
  { pattern: '/.bzr/*',             action: 'block', description: 'Bazaar repository exposure' },
  { pattern: '/.DS_Store',          action: 'block', description: 'macOS directory listing artifact' },

  // ── Backup / archive files ────────────────────────────────────────────────
  { pattern: '/backup/*',           action: 'block', description: 'Backup directory traversal' },
  { pattern: '/backups/*',          action: 'block', description: 'Backup directory traversal (plural)' },
  { pattern: '/*.bak',              action: 'block', description: 'Backup file extension probe' },
  { pattern: '/*.old',              action: 'block', description: 'Old file version probe' },
  { pattern: '/*.orig',             action: 'block', description: 'Original backup file probe' },
  { pattern: '/*.zip',              action: 'block', description: 'Archive file download probe' },
  { pattern: '/*.tar',              action: 'block', description: 'Tar archive probe' },
  { pattern: '/*.tar.gz',           action: 'block', description: 'Gzip archive probe' },
  { pattern: '/*.dump',             action: 'block', description: 'Database/memory dump probe' },

  // ── OS / server file system probes ──────────────────────────────────────
  { pattern: '/etc/*',              action: 'block', description: 'Unix etc/ directory traversal' },
  { pattern: '/proc/*',             action: 'block', description: 'Linux /proc traversal' },
  { pattern: '/sys/*',              action: 'block', description: 'Linux /sys traversal' },
  { pattern: '/.ssh/*',             action: 'block', description: 'SSH key directory traversal' },
  { pattern: '/root/*',             action: 'block', description: 'Root home directory traversal' },

  // ── Apache / Nginx server status ─────────────────────────────────────────
  { pattern: '/server-status',      action: 'block', description: 'Apache server-status page' },
  { pattern: '/server-info',        action: 'block', description: 'Apache server-info page' },
  { pattern: '/nginx_status',       action: 'block', description: 'Nginx status page' },

  // ── PHP / CGI exploits ───────────────────────────────────────────────────
  { pattern: '/.htaccess',          action: 'block', description: 'Apache htaccess exposure' },
  { pattern: '/.htpasswd',          action: 'block', description: 'Apache htpasswd credential file' },
  { pattern: '/cgi-bin/*',          action: 'block', description: 'CGI script directory probe' },
  { pattern: '/*.php',              action: 'log',   description: 'PHP script access — log only (this app is not PHP)' },
  { pattern: '/shell*',             action: 'block', description: 'Web shell probe' },
  { pattern: '/cmd*',               action: 'block', description: 'Command shell probe' },
  { pattern: '/webshell*',          action: 'block', description: 'Web shell probe (explicit)' },
  { pattern: '/c99*',               action: 'block', description: 'C99 PHP shell probe' },
  { pattern: '/r57*',               action: 'block', description: 'r57 PHP shell probe' },

  // ── Admin / control panel probes ────────────────────────────────────────
  { pattern: '/admin/*',            action: 'log',   description: 'Admin route probe — log (app may use /admin)' },
  { pattern: '/administrator/*',    action: 'block', description: 'Joomla administrator probe' },
  { pattern: '/control-panel/*',    action: 'block', description: 'Generic control panel probe' },
  { pattern: '/cpanel/*',           action: 'block', description: 'cPanel access probe' },
  { pattern: '/whm/*',              action: 'block', description: 'WHM control panel probe' },
  { pattern: '/plesk/*',            action: 'block', description: 'Plesk panel probe' },
  { pattern: '/manager/*',          action: 'log',   description: 'Manager route probe — log' },

  // ── Cloud / infrastructure metadata ─────────────────────────────────────
  { pattern: '/latest/meta-data/*', action: 'block', description: 'AWS SSRF metadata endpoint probe' },
  { pattern: '/metadata/*',         action: 'block', description: 'Cloud metadata endpoint probe' },

  // ── Secrets / tokens in URL ──────────────────────────────────────────────
  { pattern: '/.well-known/acme-challenge/*', action: 'log', description: 'ACME challenge — log (may be legitimate)' },

  // ── Misc suspicious ──────────────────────────────────────────────────────
  { pattern: '/actuator/*',         action: 'block', description: 'Spring Boot actuator endpoint probe' },
  { pattern: '/_profiler/*',        action: 'block', description: 'Symfony profiler probe' },
  { pattern: '/telescope/*',        action: 'block', description: 'Laravel Telescope debug page' },
  { pattern: '/horizon/*',          action: 'block', description: 'Laravel Horizon queue dashboard' },
  { pattern: '/laravel-ops/*',      action: 'block', description: 'Laravel ops endpoint probe' },
  { pattern: '/_ignition/*',        action: 'block', description: 'Laravel Ignition error page probe' },
  { pattern: '/console/*',          action: 'block', description: 'Console endpoint probe' },
  { pattern: '/debug/*',            action: 'block', description: 'Debug endpoint probe' },
  { pattern: '/test/*',             action: 'log',   description: 'Test endpoint access — log' },
];

/* ══════════════════════════════════════════════════════════════════════════
 *  HONEYPOT TRAP PATHS
 * ══════════════════════════════════════════════════════════════════════════ */

interface HoneypotEntry {
  path: string;
  description: string;
  action: 'block' | 'alert' | 'log';
}

const HONEYPOT_PATHS: HoneypotEntry[] = [
  // These paths don't exist in the app — any hit is suspicious by definition
  { path: '/admin-login',                   action: 'block', description: 'Fake admin login trap' },
  { path: '/admin-portal',                  action: 'block', description: 'Admin portal honeypot' },
  { path: '/secret',                        action: 'block', description: 'Generic secret path trap' },
  { path: '/wp-admin',                      action: 'block', description: 'WordPress admin honeypot' },
  { path: '/wp-login.php',                  action: 'block', description: 'WordPress login honeypot' },
  { path: '/phpmyadmin',                    action: 'block', description: 'phpMyAdmin honeypot' },
  { path: '/phpMyAdmin',                    action: 'block', description: 'phpMyAdmin honeypot (case variant)' },
  { path: '/adminer',                       action: 'block', description: 'Adminer DB tool honeypot' },
  { path: '/cpanel',                        action: 'block', description: 'cPanel honeypot' },
  { path: '/login-backup',                  action: 'block', description: 'Backup login page trap' },
  { path: '/old-login',                     action: 'block', description: 'Old login page trap' },
  { path: '/api/v1/internal',               action: 'block', description: 'Internal API endpoint trap' },
  { path: '/database',                      action: 'block', description: 'Database access honeypot' },
  { path: '/db',                            action: 'block', description: 'DB shorthand honeypot' },
  { path: '/.env',                          action: 'block', description: 'Environment file honeypot' },
  { path: '/.git/config',                   action: 'block', description: 'Git config honeypot' },
  { path: '/xmlrpc.php',                    action: 'block', description: 'XML-RPC honeypot' },
  { path: '/shell.php',                     action: 'block', description: 'Web shell honeypot' },
  { path: '/c99.php',                       action: 'block', description: 'C99 shell honeypot' },
  { path: '/readme.php',                    action: 'block', description: 'Readme PHP trap' },
  { path: '/manager/html',                  action: 'block', description: 'Tomcat manager panel honeypot' },
  { path: '/solr/admin',                    action: 'block', description: 'Solr admin honeypot' },
  { path: '/jenkins',                       action: 'block', description: 'Jenkins panel honeypot' },
  { path: '/actuator/env',                  action: 'block', description: 'Spring Boot env endpoint honeypot' },
  { path: '/actuator/health',               action: 'alert', description: 'Spring Boot health endpoint — alert' },
  { path: '/_all/_search',                  action: 'block', description: 'Elasticsearch wildcard query honeypot' },
  { path: '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', action: 'block', description: 'PHPUnit RCE honeypot CVE-2017-9841' },
  { path: '/wp-json/wp/v2/users',           action: 'block', description: 'WordPress user enumeration honeypot' },
  { path: '/wp-json/oembed/1.0/embed',      action: 'alert', description: 'WordPress oEmbed probe — alert' },
  { path: '/user/register',                 action: 'block', description: 'Drupal user registration honeypot' },
  { path: '/drupal',                        action: 'block', description: 'Drupal installation path honeypot' },
  { path: '/joomla',                        action: 'block', description: 'Joomla installation path honeypot' },
  { path: '/api/swagger',                   action: 'alert', description: 'Swagger UI recon — alert' },
  { path: '/v2/api-docs',                   action: 'alert', description: 'Spring Boot Swagger recon — alert' },
  { path: '/login.cgi',                     action: 'block', description: 'Router CGI login honeypot' },
  { path: '/goform/Login',                  action: 'block', description: 'Router goform login honeypot' },
  { path: '/cgi-bin/luci',                  action: 'block', description: 'OpenWRT LuCI admin honeypot' },
  { path: '/remote/login',                  action: 'block', description: 'Fortinet VPN login honeypot' },
  { path: '/+CSCOE+/logon.html',            action: 'block', description: 'Cisco ASA VPN honeypot' },
];

/* ══════════════════════════════════════════════════════════════════════════
 *  BOT PROTECTION — COMPREHENSIVE USER-AGENT BLOCKLIST
 * ══════════════════════════════════════════════════════════════════════════ */

const BOT_UA_BLOCKLIST: string[] = [
  // ── Vulnerability scanners ────────────────────────────────────────────────
  'nikto', 'sqlmap', 'nmap', 'masscan', 'zmap', 'dirbuster', 'gobuster',
  'dirb', 'wfuzz', 'ffuf', 'nuclei', 'acunetix', 'nessus', 'openvas',
  'qualys', 'burpsuite', 'burp suite', 'owasp zap', 'owaspzap', 'arachni',
  'w3af', 'skipfish', 'webscarab', 'havij', 'vega/',
  // ── Exploitation frameworks ───────────────────────────────────────────────
  'metasploit', 'commix', 'hydra', 'medusa/', 'slowloris', 'slowhttptest',
  'hping', 'loic',
  // ── Aggressive crawlers / SEO bots ───────────────────────────────────────
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'blexbot', 'petalbot',
  'megaindex', 'bytespider', 'sogou', 'yandexbot', 'seoprofiler', 'rogerbot',
  'opensiteexplorer', 'spiderbot', 'mauibot', 'alphabot', 'proximic',
  'spbot', 'sistrix', 'seokicks', 'urlappendbot', 'coccocbot',
  // ── Automation / raw HTTP libraries ──────────────────────────────────────
  'python-requests', 'python-urllib', 'python-httpx', 'go-http-client',
  'ruby/', 'perl/', 'libwww-perl', 'wget/', 'curl/7.', 'curl/8.',
  'httpie', 'axios/', 'node-fetch', 'node-http', 'java/',
  'apache-httpclient', 'okhttp', 'got/', 'undici',
  // ── Headless browsers / automation tools ─────────────────────────────────
  'phantomjs', 'headlesschrome', 'headless chrome', 'selenium', 'webdriver',
  'puppeteer', 'playwright', 'cypress',
  // ── Recon / OSINT probes ──────────────────────────────────────────────────
  'zgrab', 'censys', 'shodan', 'internet measurement', 'netcraft',
  'internetarchive', 'thesis research', 'scrapy', 'heritrix',
  // ── Web scrapers ──────────────────────────────────────────────────────────
  'httrack', 'teleport pro', 'webcopier', 'webzip', 'websuck',
  'black widow', 'sitesucker', 'wget',
  // ── DDoS / stress tools ───────────────────────────────────────────────────
  'flood', 'stress', 'jmeter',
  // ── WordPress specific ────────────────────────────────────────────────────
  'wp-login', 'wpscan', 'wpscanner',
];

const BOT_UA_ALLOWLIST: string[] = [
  // ── Major search engine crawlers ─────────────────────────────────────────
  'Googlebot', 'Googlebot-Image', 'Googlebot-Video', 'Googlebot-News',
  'Bingbot', 'msnbot', 'AdIdxBot',
  'Slurp',          // Yahoo
  'DuckDuckBot',
  'Baiduspider',
  'YandexBot',      // Yandex search (different from yandexbot spam bot — matched by substring)
  'Applebot',
  'Twitterbot',
  'facebot', 'facebookexternalhit',
  'LinkedInBot',
  'WhatsApp',
  'Discordbot',
  'TelegramBot',
  'Slackbot',
  'Embedly',
  'ia_archiver',    // Internet Archive / Wayback Machine
  'archive.org_bot',
  'CCBot',          // Common Crawl
  'SeznamBot',
  'MojeekBot',
  'ExaBot',
  'Qwantify',
  'PetalBot',       // Huawei search (also in blocklist — allowlist wins for explicit match)
  'SemrushBot',     // Only if you're OK with SEMrush crawling — remove if not
  'AhrefsBot',      // Only if you're explicitly OK with Ahrefs crawling
];

/* ══════════════════════════════════════════════════════════════════════════
 *  DEFAULT BOT PROTECTION CONFIG
 * ══════════════════════════════════════════════════════════════════════════ */

const BOT_PROTECTION_CONFIG = {
  enabled: true,
  action: 'block',
  botScoreThreshold: 70,
  blockEmptyUA: false,
  challengeMode: false,
  userAgentBlocklist: BOT_UA_BLOCKLIST,
  userAgentAllowlist: BOT_UA_ALLOWLIST,
};

/* ══════════════════════════════════════════════════════════════════════════
 *  DEFAULT HONEYPOT CONFIG
 * ══════════════════════════════════════════════════════════════════════════ */

const HONEYPOT_CONFIG = {
  enabled: true,
  paths: HONEYPOT_PATHS.map(h => ({
    path: h.path,
    action: h.action,
    description: h.description,
    isActive: true,
  })),
  autoBlockOnHit: true,
  autoBlockDurationMs: 3_600_000, // 1 hour
};

/* ══════════════════════════════════════════════════════════════════════════
 *  RUNNER
 * ══════════════════════════════════════════════════════════════════════════ */

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log('🔌  Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅  Connected\n');

  /* ── 1. Seed path rules ────────────────────────────────────────────────── */
  console.log('📋  Seeding firewall path rules...');
  let inserted = 0;
  let skipped = 0;

  for (const rule of BLOCKED_PATHS) {
    const exists = await FirewallPathRule.findOne({ pattern: rule.pattern });
    if (exists) {
      skipped++;
      continue;
    }
    await FirewallPathRule.create({
      pattern: rule.pattern,
      action: rule.action,
      methods: [],
      description: rule.description,
      isActive: true,
      createdBy: 'seed-script',
    });
    inserted++;
  }

  console.log(`   ✅  Path rules — inserted: ${inserted}, already existed: ${skipped}\n`);

  /* ── 2. Seed honeypot config ───────────────────────────────────────────── */
  console.log('🍯  Seeding honeypot paths...');

  const existingHoneypot = await FirewallConfig.findOne({ key: 'honeypot_config' });
  if (existingHoneypot) {
    const current = existingHoneypot.value as typeof HONEYPOT_CONFIG;
    const existingPaths = new Set((current.paths || []).map((p: any) => p.path));
    const newPaths = HONEYPOT_PATHS.filter(h => !existingPaths.has(h.path)).map(h => ({
      path: h.path,
      action: h.action,
      description: h.description,
      isActive: true,
    }));

    if (newPaths.length > 0) {
      existingHoneypot.value = {
        ...current,
        paths: [...(current.paths || []), ...newPaths],
      };
      await existingHoneypot.save();
      console.log(`   ✅  Honeypot config updated — added ${newPaths.length} new paths (${existingPaths.size} already existed)\n`);
    } else {
      console.log(`   ✅  All ${HONEYPOT_PATHS.length} honeypot paths already seeded — no changes\n`);
    }
  } else {
    await FirewallConfig.create({
      key: 'honeypot_config',
      value: HONEYPOT_CONFIG,
      updatedBy: 'seed-script',
    });
    console.log(`   ✅  Honeypot config created with ${HONEYPOT_PATHS.length} trap paths\n`);
  }

  /* ── 3. Seed bot protection config ────────────────────────────────────── */
  console.log('🤖  Seeding bot protection UA lists...');

  const existingBot = await FirewallConfig.findOne({ key: 'bot_protection' });
  if (existingBot) {
    const current = existingBot.value as typeof BOT_PROTECTION_CONFIG;
    const existingBlock = new Set(current.userAgentBlocklist || []);
    const existingAllow = new Set(current.userAgentAllowlist || []);

    const mergedBlock = [...existingBlock, ...BOT_UA_BLOCKLIST.filter(ua => !existingBlock.has(ua))];
    const mergedAllow = [...existingAllow, ...BOT_UA_ALLOWLIST.filter(ua => !existingAllow.has(ua))];

    existingBot.value = { ...current, userAgentBlocklist: mergedBlock, userAgentAllowlist: mergedAllow };
    await existingBot.save();
    console.log(
      `   ✅  Bot protection updated — blocklist: ${mergedBlock.length} entries, allowlist: ${mergedAllow.length} entries\n`,
    );
  } else {
    await FirewallConfig.create({
      key: 'bot_protection',
      value: BOT_PROTECTION_CONFIG,
      updatedBy: 'seed-script',
    });
    console.log(
      `   ✅  Bot protection config created — ${BOT_UA_BLOCKLIST.length} blocked UAs, ${BOT_UA_ALLOWLIST.length} allowed UAs\n`,
    );
  }

  await mongoose.disconnect();
  console.log('🎉  Firewall defaults seeded successfully!');
  process.exit(0);
};

run().catch(err => {
  console.error('❌  Seed failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
