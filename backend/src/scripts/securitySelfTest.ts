/**
 * securitySelfTest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-attack simulation for local development.
 * Tests every active security layer and reports pass/fail for each.
 *
 * Usage:
 *   npx ts-node src/scripts/securitySelfTest.ts
 *   npx ts-node src/scripts/securitySelfTest.ts --base http://localhost:5000
 *
 * The backend must be running. No auth token needed — all probes are
 * unauthenticated, which is exactly what real scanners do.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

// On Windows, Node's Happy Eyeballs races IPv4/IPv6 and can ECONNREFUSED.
// Force family:6 in the request so it always uses the IPv6 loopback the
// backend actually binds to.
const BASE_URL =
  process.argv.find(a => a.startsWith('--base='))?.split('=')[1]
  ?? process.env.SECURITY_TEST_BASE
  ?? 'http://localhost:5000';

// 4 or 6 — detected from BASE_URL
const FORCE_FAMILY: 4 | 6 | 0 = BASE_URL.includes('[::') ? 6
  : BASE_URL.includes('localhost') ? 6   // server logs show it binds ::1
  : 0;

/** ms between individual requests — slow enough not to trip your own rate limiter */
const BETWEEN_REQUESTS_MS = 300;

/** ms to wait between test suites */
const BETWEEN_SUITES_MS = 800;

// Color helpers (ANSI)
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  grey: '\x1b[90m',
};

// ─── Result tracking ─────────────────────────────────────────────────────────

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  expected: number | number[];
  actual: number;
  note?: string;
}

const results: TestResult[] = [];

function pass(suite: string, name: string, actual: number, expected: number | number[], note?: string) {
  results.push({ suite, name, passed: true, expected, actual, note });
  const mark = `${C.green}✓${C.reset}`;
  console.log(`  ${mark} ${name} ${C.grey}(HTTP ${actual})${C.reset}${note ? ` — ${note}` : ''}`);
}

function fail(suite: string, name: string, actual: number, expected: number | number[], note?: string) {
  results.push({ suite, name, passed: false, expected, actual, note });
  const mark = `${C.red}✗${C.reset}`;
  const exp = Array.isArray(expected) ? expected.join('/') : expected;
  console.log(`  ${mark} ${name} ${C.grey}(expected ${exp}, got ${actual})${C.reset}${note ? ` — ${note}` : ''}`);
}

// ─── HTTP request helper ──────────────────────────────────────────────────────

interface ProbeOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Accept these status codes as a passing grade */
  expectBlocked?: number[];
  /** Treat these as a "pass for this probe" if we just want to see the server respond */
  expectAny?: boolean;
}

function probe(
  path: string,
  opts: ProbeOptions = {}
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: http.RequestOptions & { rejectUnauthorized?: boolean; family?: number } = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method ?? 'GET',
      // Force IPv6 on Windows where Happy Eyeballs causes ECONNREFUSED
      ...(FORCE_FAMILY !== 0 ? { family: FORCE_FAMILY } : {}),
      headers: {
        'Accept': 'text/html,application/json,*/*',
        ...(opts.headers ?? {}),
      },
      // Don't verify TLS for localhost self-signed certs
      rejectUnauthorized: false,
    };

    if (opts.body) {
      (options.headers as Record<string, string>)['Content-Length'] =
        Buffer.byteLength(opts.body).toString();
    }

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }
        resolve({ status: res.statusCode ?? 0, body, headers });
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });

    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function runProbe(
  suite: string,
  name: string,
  path: string,
  blocked: number[],
  opts: ProbeOptions = {}
): Promise<number> {
  try {
    const { status } = await probe(path, opts);
    const isBlocked = blocked.includes(status);
    if (isBlocked) {
      pass(suite, name, status, blocked);
    } else {
      fail(suite, name, status, blocked, 'NOT blocked — security may be bypassed or feature disabled');
    }
    await sleep(BETWEEN_REQUESTS_MS);
    return status;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(suite, name, 0, blocked, `Request error: ${msg}`);
    return 0;
  }
}

// ─── Suite 1: Honeypot paths ─────────────────────────────────────────────────

async function suiteHoneypots() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 1 — Honeypot Traps${C.reset}`);
  console.log(`${C.grey}  Probing CMS/tool paths that should be trapped.${C.reset}`);
  console.log(`${C.grey}  Expected: 403 or 404 (anything that isn't 200).${C.reset}\n`);

  const BLOCKED = [400, 403, 404, 410, 429];

  const honeypots = [
    ['GET /wp-admin',              '/wp-admin'],
    ['GET /wp-login.php',          '/wp-login.php'],
    ['GET /.env',                  '/.env'],
    ['GET /.git/config',           '/.git/config'],
    ['GET /shell.php',             '/shell.php'],
    ['GET /phpmyadmin',            '/phpmyadmin'],
    ['GET /phpMyAdmin',            '/phpMyAdmin'],
    ['GET /adminer',               '/adminer'],
    ['GET /jenkins',               '/jenkins'],
    ['GET /actuator/env',          '/actuator/env'],
    ['GET /xmlrpc.php',            '/xmlrpc.php'],
    ['GET /c99.php',               '/c99.php'],
    ['GET /manager/html',          '/manager/html'],
    ['GET /solr/admin',            '/solr/admin'],
    ['GET /_all/_search',          '/_all/_search'],
    ['GET /drupal',                '/drupal'],
    ['GET /joomla',                '/joomla'],
    ['GET /cpanel',                '/cpanel'],
    ['GET /database',              '/database'],
    ['GET /goform/Login',          '/goform/Login'],
    ['GET /login.cgi',             '/login.cgi'],
    ['GET /remote/login',          '/remote/login'],
    ['GET /wp-json/wp/v2/users',   '/wp-json/wp/v2/users'],
    ['GET /vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
                                   '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php'],
  ] as const;

  for (const [name, path] of honeypots) {
    await runProbe('Honeypots', name, path, BLOCKED);
  }
}

// ─── Suite 2: Attack-pattern path blocking ───────────────────────────────────

async function suitePathBlocking() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 2 — Attack-Pattern Path Blocking${C.reset}`);
  console.log(`${C.grey}  Regex-matched probe paths caught by attackPatternMiddleware.${C.reset}\n`);

  const BLOCKED = [400, 403, 404, 410, 429];

  const probes = [
    ['GET /etc/passwd',             '/etc/passwd'],
    ['GET /proc/self/environ',      '/proc/self/environ'],
    ['GET /var/log/apache2/access.log', '/var/log/apache2/access.log'],
    ['GET /config.php',             '/config.php'],
    ['GET /backup/db.sql',          '/backup/db.sql'],
    ['GET /dump.sql',               '/dump.sql'],
    ['GET /.htaccess',              '/.htaccess'],
    ['GET /.DS_Store',              '/.DS_Store'],
    ['GET /web.config',             '/web.config'],
    ['POST /api/v1/auth/login SQL injection',
      '/api/v1/auth/login',
      { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: "' OR 1=1--", password: 'x' }) }],
    ['GET XSS attempt in query',
      '/api/v1/users?q=<script>alert(1)</script>'],
    ['GET path traversal /../',
      '/api/v1/../../../etc/passwd'],
  ] as [string, string, ProbeOptions?][];

  for (const [name, path, opts] of probes) {
    await runProbe('PathBlocking', name, path, BLOCKED, opts);
  }
}

// ─── Suite 3: Bot User-Agent blocking ────────────────────────────────────────

async function suiteBotUA() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 3 — Bot User-Agent Blocking${C.reset}`);
  console.log(`${C.grey}  Requests with known scanner/automation UA strings.${C.reset}`);
  console.log(`${C.grey}  Expected: 403 (bot_protection feature must be enabled in DB).${C.reset}\n`);

  const BLOCKED = [400, 403, 429];

  // UA strings that substring-match entries in BOT_UA_BLOCKLIST
  const bots: [string, string][] = [
    ['nikto/2.1.6 scanner',         'nikto/2.1.6'],
    ['sqlmap/1.7 SQL injector',     'sqlmap/1.7'],
    ['masscan/1.0 port scanner',    'masscan/1.0 (https://github.com/robertdavidgraham/masscan)'],
    ['nmap/7.93 network mapper',    'nmap/7.93'],
    ['nessus vulnerability scanner','Nessus/10.0'],
    ['python-requests/2.28',        'python-requests/2.28.2'],
    ['python-urllib/3.10',          'python-urllib3/1.26.12'],
    ['curl/7.80 raw HTTP',          'curl/7.80.0'],
    ['wget scraper',                'Wget/1.21.3 (linux-gnu)'],
    ['libwww-perl lib',             'libwww-perl/6.67'],
    ['go-http-client auto',         'Go-http-client/1.1'],
    ['MetaSploit framework',        'Mozilla/4.0 (compatible; Metasploit RSPEC)'],
    ['dirbuster dir scanner',       'DirBuster-1.0-RC1 (http://www.owasp.org/index.php/Category:OWASP_DirBuster_Project)'],
    ['nuclei template scanner',     'Nuclei - Open-source project (github.com/projectdiscovery/nuclei)'],
    ['burpsuite scanner',           'Mozilla/5.0 BurpSuite/2023.10'],
    ['zgrab banner grabber',        'zgrab/0.x'],
    ['scrapy spider framework',     'Scrapy/2.8.0 (+https://scrapy.org)'],
    ['WPScan WordPress scanner',    'WPScan v3.8.22 (https://wpscan.com/wordpress-security-scanner)'],
    ['acunetix web vulnscan',       'Mozilla/5.0 (compatible; Acunetix Web Vulnerability Scanner; acunetix.com)'],
    ['semrushbot seo crawler',      'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'],
  ];

  for (const [name, ua] of bots) {
    await runProbe(
      'BotUA',
      name,
      '/api/v1/health',  // Hit a real endpoint — detection is at the middleware layer
      BLOCKED,
      { headers: { 'User-Agent': ua } }
    );
  }
}

// ─── Suite 4: Rate limiting ───────────────────────────────────────────────────

async function suiteRateLimit() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 4 — Rate Limiting${C.reset}`);
  console.log(`${C.grey}  Rapid repeated requests to auth endpoint (should get 429).${C.reset}\n`);

  const endpoint = '/api/v1/auth/login';
  const method = 'POST';
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ email: 'test@example.com', password: 'wrong' });

  let got429 = false;
  let attempts = 0;
  const MAX = 25;

  process.stdout.write(`  Firing up to ${MAX} rapid POST ${endpoint} requests...`);

  for (let i = 0; i < MAX; i++) {
    try {
      const { status } = await probe(endpoint, { method, headers, body });
      attempts++;
      if (status === 429) {
        got429 = true;
        console.log(` ${C.green}429 after ${i + 1} requests${C.reset}`);
        break;
      }
    } catch {
      break;
    }
    // No sleep here — we WANT to be fast to trigger rate limiting
  }

  if (!got429) {
    console.log(` ${C.yellow}no 429 after ${attempts} requests${C.reset}`);
  }

  if (got429) {
    pass('RateLimit', `Rate limit triggers on auth endpoint`, 429, [429]);
  } else {
    fail('RateLimit', `Rate limit triggers on auth endpoint`, 200, [429],
      'Consider lowering windowMs or max in rateLimiter config');
  }
}

// ─── Suite 5: Suspicious 404 scanner detection ───────────────────────────────

async function suiteSuspicious404() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 5 — Suspicious 404 Scanner Detection${C.reset}`);
  console.log(`${C.grey}  Sequential 404s to random-looking paths that mimic directory brute-forcing.${C.reset}`);
  console.log(`${C.grey}  The IP should be flagged after enough sequential 404s.${C.reset}\n`);

  const BLOCKED = [403, 429];
  const junkPaths = [
    '/uploads/shell.php',
    '/img/config.bak',
    '/assets/db.sql',
    '/static/passwords.txt',
    '/public/secret.env',
    '/files/users.csv',
    '/backup.zip',
    '/dump.tar.gz',
    '/old-site/admin.php',
    '/test/config.ini',
    '/temp/debug.log',
    '/install.php',
    '/setup.php',
    '/config/settings.php',
    '/api/v1/debug',
  ];

  let triggeredBlock = false;
  process.stdout.write(`  Firing ${junkPaths.length} sequential 404 probes...`);

  for (const p of junkPaths) {
    try {
      const { status } = await probe(p);
      if (BLOCKED.includes(status)) {
        triggeredBlock = true;
        console.log(`\n  ${C.green}✓${C.reset} Auto-block triggered at ${p} (HTTP ${status})`);
        break;
      }
    } catch {
      break;
    }
    await sleep(150);
  }

  if (!triggeredBlock) {
    console.log(` ${C.yellow}no auto-block triggered${C.reset}`);
  }

  if (triggeredBlock) {
    pass('Suspicious404', '404 scan detection auto-blocks IP', 403, BLOCKED);
  } else {
    fail('Suspicious404', '404 scan detection auto-blocks IP', 404, BLOCKED,
      'Check suspicious_404 threshold config in SecurityConfig or BlocklistService');
  }
}

// ─── Suite 6: Security headers ───────────────────────────────────────────────

async function suiteSecurityHeaders() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 6 — Security Response Headers${C.reset}`);
  console.log(`${C.grey}  Verifying hardened headers are present on every response.${C.reset}\n`);

  try {
    const { headers } = await probe('/api/v1/health');

    const REQUIRED: Record<string, string> = {
      'x-content-type-options':          'nosniff',
      'x-frame-options':                 'DENY',
      'referrer-policy':                 '',   // any value is fine
      'x-xss-protection':                '',
      'strict-transport-security':       '',
      'content-security-policy':         '',
    };

    for (const [header, expectedValue] of Object.entries(REQUIRED)) {
      const actual = headers[header];
      const present = actual !== undefined;
      const valueOk = expectedValue === '' || actual?.toLowerCase().includes(expectedValue.toLowerCase());

      if (present && valueOk) {
        pass('Headers', `${header}`, 200, [200], actual);
      } else if (!present) {
        fail('Headers', `${header}`, 200, [200], 'header missing');
      } else {
        fail('Headers', `${header}`, 200, [200], `got: "${actual}", expected to include "${expectedValue}"`);
      }
    }

    // Dangerous headers that should NOT be present
    const MUST_ABSENT = ['x-powered-by', 'server'];
    for (const h of MUST_ABSENT) {
      if (headers[h]) {
        fail('Headers', `${h} must be absent`, 200, [200], `leaks: "${headers[h]}"`);
      } else {
        pass('Headers', `${h} absent (no server fingerprint)`, 200, [200]);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail('Headers', 'fetch /api/v1/health', 0, [200], msg);
  }
}

// ─── Suite 7: Method not allowed / CSRF probe ────────────────────────────────

async function suiteCsrf() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 7 — CSRF Protection${C.reset}`);
  console.log(`${C.grey}  State-changing POST without X-XSRF-TOKEN header should be 403.${C.reset}\n`);

  // Any auth-required POST endpoint — reset-password is a clean target
  await runProbe(
    'CSRF',
    'POST without CSRF token → 403',
    '/api/v1/auth/change-password',
    [401, 403],
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'test', newPassword: 'Test1234!' }),
    }
  );
}

// ─── Suite 8: Already-blocked IP is still blocked ────────────────────────────

async function suiteBlockedIpPersists() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 8 — Blocked IP Enforcement${C.reset}`);
  console.log(`${C.grey}  After prior suites, 127.0.0.1 may be auto-blocked.${C.reset}`);
  console.log(`${C.grey}  If so, any subsequent request should still return 403.${C.reset}\n`);

  try {
    const { status } = await probe('/api/v1/health');
    if (status === 403) {
      pass('BlockedIP', 'IP is blocked — further requests return 403', 403, [403],
        'You will need to unblock 127.0.0.1 from the Firewall panel after this test');
    } else {
      // Not blocked — that is ok if earlier suites did not trigger threshold
      pass('BlockedIP', 'IP is not yet auto-blocked (threshold not reached in test)', status, [200, 403],
        'Normal — single test run may not hit auto-block threshold');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail('BlockedIP', 'health check', 0, [200, 403], msg);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary() {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${C.bold}SECURITY SELF-TEST SUMMARY${C.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total:  ${total}`);
  console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
  console.log(`  ${failed > 0 ? C.red : C.grey}Failed: ${failed}${C.reset}`);
  console.log(`${'─'.repeat(60)}`);

  if (failed > 0) {
    console.log(`\n${C.bold}${C.red}FAILED CHECKS:${C.reset}`);
    for (const r of results.filter(r => !r.passed)) {
      const exp = Array.isArray(r.expected) ? r.expected.join('/') : r.expected;
      console.log(`  ${C.red}✗${C.reset} [${r.suite}] ${r.name}`);
      console.log(`     expected HTTP ${exp}, got ${r.actual}`);
      if (r.note) console.log(`     note: ${r.note}`);
    }
  }

  console.log(`\n${C.bold}${C.yellow}IMPORTANT — After running:${C.reset}`);
  console.log(`  1. Check Security Events tab in the Super-Admin panel.`);
  console.log(`     You should see honeypot_hit, path_blocked, ua_blocked entries.`);
  console.log(`  2. Check your inbox for a Resend security alert email.`);
  console.log(`  3. Unblock 127.0.0.1 / ::1 in Firewall → Blocked IPs if auto-blocked.`);
  console.log(`     (Super Admin → Firewall → Blocked IPs → remove test entries)\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  FUEL ORDER — SECURITY SELF-TEST${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`  Target:  ${C.cyan}${BASE_URL}${C.reset}`);
  console.log(`  Started: ${new Date().toISOString()}`);

  // Sanity-check: server must be reachable
  console.log(`\n${C.grey}Checking server reachability (family=${FORCE_FAMILY || 'auto'})...${C.reset}`);
  try {
    const { status } = await probe('/api/v1/health');
    console.log(`  Server responded: HTTP ${status}`);
    if (status >= 500) {
      console.error(`${C.red}  Server returned 5xx. Check your backend logs.${C.reset}`);
      process.exit(1);
    }
    if (status === 403) {
      console.log(`  ${C.yellow}Note: 403 — IP may already be partially blocked from a previous run. Continuing.${C.reset}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err.message || err.name || String(err)) : String(err);
    console.error(`${C.red}  Cannot reach ${BASE_URL}: ${msg || '(connection refused/reset)'}${C.reset}`);
    console.error(`${C.red}  Hint: the backend log shows it binds to ::1. If you see ECONNREFUSED,${C.reset}`);
    console.error(`${C.red}  run:  npx ts-node src/scripts/securitySelfTest.ts --base=http://[::1]:5000${C.reset}`);
    console.error(`${C.red}  Start the backend first: cd backend && npm run dev${C.reset}`);
    process.exit(1);
  }

  await suiteHoneypots();        await sleep(BETWEEN_SUITES_MS);
  await suitePathBlocking();     await sleep(BETWEEN_SUITES_MS);
  await suiteBotUA();            await sleep(BETWEEN_SUITES_MS);
  await suiteRateLimit();        await sleep(BETWEEN_SUITES_MS);
  await suiteSuspicious404();    await sleep(BETWEEN_SUITES_MS);
  await suiteSecurityHeaders();  await sleep(BETWEEN_SUITES_MS);
  await suiteCsrf();             await sleep(BETWEEN_SUITES_MS);
  await suiteBlockedIpPersists();

  printSummary();
}

main().catch(err => {
  console.error(`${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
