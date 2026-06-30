# Reliability & Scale Roadmap — Fuel Order System

> Goal: take the system from "professional code on fragile infrastructure" to
> "professional code on resilient infrastructure" — without ever breaking
> existing functionality. Every phase is independently shippable and ordered so
> that nothing later breaks anything earlier.
>
> **Rule for every change:** behaviour for end users must stay identical. New
> code only changes *what happens under failure / load*, never the happy path.

Status legend: ✅ done · ⬜ todo · 🔒 blocked by an earlier phase

---

## Phase 0 — Stop the bleeding (DONE)

| # | Fix | File | Status |
|---|-----|------|--------|
| 0.1 | Raise PM2 RSS ceiling 512M → 2.5G | `ecosystem.config.js` | ✅ |
| 0.2 | Let V8 heap grow to 2G (`--max-old-space-size=2048`) | `ecosystem.config.js` | ✅ |
| 0.3 | Drop giant per-edit JSON logs `info` → `debug` | `controllers/lpoSummaryController.ts` | ✅ |

**Deploy:** `npm run build && pm2 reload ecosystem.config.js --update-env && pm2 save`

---

## Phase 1 — Count-cap the in-memory security maps (FREE, no deps, no infra) ✅ DONE

> Implemented + `tsc` clean. All five maps now have a hard count cap with
> oldest-first eviction (mirrors the existing `trustedIPs` guard). No-op under
> normal traffic; only engages under an IP-diversity flood.

**Why:** every in-memory map is bounded by *time* (TTL/sweep) but not by *count*.
Under an attack from thousands of distinct IPs, entries are created faster than
the sweep removes them → memory-exhaustion DoS on the box shared with MongoDB.
Big-tech rule: a cache must be bounded by count OR size, never time alone.
This is both a reliability fix and a **security hardening**.

**Pattern to copy:** the proven one already in `blocklistService.markTrusted()`
(`if (map.size > N) sweep/evict`). No new dependency.

| # | Map | File | Cap | Eviction |
|---|-----|------|-----|----------|
| 1.1 | `suspiciousIPs` | `services/blocklistService.ts:28` | 50_000 | drop oldest `firstEvent` |
| 1.2 | `_windows` (404 tracker) | `middleware/suspicious404Middleware.ts:29` | 50_000 | force-sweep when over cap, then drop oldest |
| 1.3 | `failedLoginCache` | `utils/anomalyDetectionService.ts:30` | 20_000 | drop oldest `lastAttempt` |
| 1.4 | `ipGeoCache` | `utils/geolocationService.ts:24` | 10_000 | drop oldest `expires` |
| 1.5 | `userLocationCache` | `utils/geolocationService.ts:23` | 10_000 | drop oldest `lastUpdate` |

**Acceptance:** normal traffic never reaches a cap (caps are far above real user
counts); a synthetic flood of 100k unique IPs keeps RSS flat instead of climbing.
**Risk:** none to functionality — caps only engage under abnormal load and only
evict the oldest, least-relevant tracking entries.

---

## Phase 2 — Observability you can act on (CHEAP, no infra)

**Why:** big tech alerts on *trends over time*, not just instantaneous spikes.
You already alert on heap % of limit (`databaseMonitor`). Add the missing pieces.

| # | Fix | Where | Status |
|---|-----|-------|--------|
| 2.1 | Log `[mem] rss/heap` every tick at `info` + bounded 30-sample buffer | `databaseMonitor.sampleMemory()` | ✅ done |
| 2.2 | External uptime monitor hitting `/api/health` | infra (UptimeRobot / BetterStack free tier) | ⬜ manual |
| 2.3 | Warn + email on SUSTAINED RSS growth (≥25% over window, >1.5 GB) | `databaseMonitor.checkMemoryTrend()` | ✅ done |
| 2.4 | `pm2 install pm2-logrotate` | infra | ⬜ manual |

**2.2 — external uptime monitor (do once, ~3 min):**
Sign up at a free monitor (UptimeRobot / BetterStack) and add an HTTP(S) check:
- URL: `https://<your-api-host>/api/health`  ·  Method: GET  ·  Expect: `200`
- Interval: 1–5 min  ·  Alert: email/SMS to you
This catches a *fully dead process* — the one failure the in-process monitor
can never report, because if Node is down it can't email you.

**2.4 — bound PM2's own logs (run on the server, once):**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```
Winston already rotates the app logs (5 MB × 5); this rotates PM2's separate
`~/.pm2/logs/*` files so they can't fill the disk over months.

**Risk:** none — additive logging/monitoring only.

---

## Phase 3 — Make a single-box restart graceful (LOW risk) ✅ DONE

**Why:** today a memory restart drops in-flight requests for a few seconds.
You already have graceful shutdown (`SIGTERM` drain). Tighten PM2 to match.

| # | Fix | File | Status |
|---|-----|------|--------|
| 3.1 | `kill_timeout: 16000` (≥ the 15s drain; default was 1.6s and SIGKILLed mid-drain) | `ecosystem.config.js` | ✅ done |
| 3.2 | `wait_ready: true` + `process.send('ready')` after `httpServer.listen` | `ecosystem.config.js` + `server.ts` | ✅ done |
| 3.3 | `listen_timeout: 30000` (heavy startup: DB connect + seeds + backfill) | `ecosystem.config.js` | ✅ done |

**⚠️ First-time apply:** PM2 reads `kill_timeout` / `wait_ready` at process
*start*, so apply them once with a full re-create (one brief restart), then all
future restarts are graceful:
```bash
pm2 delete fuel-order-api && pm2 start ecosystem.config.js --env production && pm2 save
```

**Note:** true *zero*-downtime needs ≥2 instances (Phase 4). This phase makes the
single-instance restart as clean as it can be — the drain now completes instead
of being cut off at 1.6s.
**Risk:** low — only affects restart sequencing.

---

## Phase 4 — Run N instances safely (the "big-tech replica" goal) 🔒 needs Phases 1–3

This is the heart of "a restart is invisible." It is sequenced carefully because
**naively adding a replica today would double every background job.**

### 4a. Centralise all background work behind a leader flag
**Problem:** `startServer()` unconditionally starts cron jobs, archival, backup,
DR drill, change streams, and the DB monitor. With 2 instances they all run twice.

| # | Fix | File |
|---|-----|------|
| 4a.1 | Add `RUN_BACKGROUND_JOBS` env flag (or Redis-based leader lock) | `config/index.ts` |
| 4a.2 | Gate `jobRegistry.startAll()`, `startArchivalScheduler()`, `startBackupScheduler()`, `disasterRecoveryDrill`, `backupService.writeManifestSafe()` behind the flag | `server.ts:377-389` |
| 4a.3 | Gate `startChangeStreams()` behind the flag (only the leader emits, avoids duplicate `data_changed` events) | `server.ts:372` |
| 4a.4 | Keep `databaseMonitor` on leader only (avoids duplicate alert emails) | `server.ts:396` |

Designate exactly one instance as leader (`RUN_BACKGROUND_JOBS=true`); workers
only serve HTTP/WebSocket. A Redis `SET NX EX` lease is the more robust version
once Redis is in place (auto-failover if the leader dies).

### 4b. Actually attach the Socket.io Redis adapter
**Problem:** `connectRedis()` never creates `redisPub`/`redisSub`, so the adapter
in `websocket.ts` is never attached → events don't cross instances.

| # | Fix | File |
|---|-----|------|
| 4b.1 | In `connectRedis()`, create `redisPub` + `redisSub` (duplicate clients) when `REDIS_URL` is set | `config/redis.ts:59` |
| 4b.2 | Verify `initializeWebSocket` logs "Redis adapter attached" | `services/websocket.ts:55` |
| 4b.3 | Provision Redis (local on the box is fine to start) | infra |

### 4c. Run the instances
| # | Fix | Where |
|---|-----|-------|
| 4c.1 | PM2: 1 leader (`RUN_BACKGROUND_JOBS=true`) + 1–2 workers, distinct app names/ports | `ecosystem.config.js` |
| 4c.2 | nginx upstream load-balancing the API port(s) | infra (nginx) |
| 4c.3 | WebSocket: sticky sessions (`ip_hash`) OR rely on Redis adapter + allow polling fallback | nginx |

**Acceptance:** kill any one instance mid-request → users see no error; backups/
archival still run exactly once; realtime updates still reach every client.
**Risk:** medium — this is the biggest change; do it on staging first, behind the
leader flag so you can run "2 instances, 1 leader" before trusting it.

---

## Phase 5 — Separate MongoDB from the API box 🔒 independent, do anytime

**Why:** co-locating the DB and app is the single biggest structural risk — they
fight for the same 8 GB; an API spike can starve the database and vice-versa.
Big tech never co-locates.

| # | Fix | Notes |
|---|-----|-------|
| 5.1 | Stand up MongoDB on its own host (2nd machine) **or** managed tier (Atlas) | start with a small box |
| 5.2 | Make it a 3-node replica set | also *enables MongoDB change streams*, which you already use but which need a replica set |
| 5.3 | Tune WiredTiger cache explicitly once DB has its own box | `--wiredTigerCacheSizeGB` |
| 5.4 | Update `MONGODB_URI`, verify TLS + auth, re-point cloudflared if needed | env only — no code change |
| 5.5 | Confirm DR restore path still works against the new topology | run `dr:dry-run` |

**Risk:** medium — it's a data move; rehearse with `dr:restore:local` first. No
application code changes, only connection string + topology.

---

## Phase 6 — Professional ops hygiene (ongoing)

| # | Fix | Notes |
|---|-----|-------|
| 6.1 | Heap snapshots **only on staging**, never expose `--inspect` in prod | research flags it as a data-exposure security risk |
| 6.2 | Synthetic load test (`autocannon`/`k6`) with `limit=10000` queries to find the real high-water-mark | sizes the heap/restart limits with data, not guesses |
| 6.3 | Confirm R2 offsite backups + monthly restore drill are green | you already have `disasterRecoveryDrill` — verify it's enabled |
| 6.4 | Document runbook: "what to do when the API restarts / DB disconnects" | one page; reduces panic |
| 6.5 | Review rate limiters for per-route sanity under 600 users | `middleware/rateLimiters.ts` |

---

## Suggested execution order

1. **Phase 1** — free, immediate hardening, zero infra. *(start here)*
2. **Phase 2** — see the trend so later phases are data-driven.
3. **Phase 3** — clean single-box restarts.
4. **Phase 5** — give the DB its own box (independent of the app-tier work).
5. **Phase 4** — multi-instance (the big one; needs Redis + leader flag).
6. **Phase 6** — ongoing hygiene.

Phases 1–3 are pure code + PM2 config: low risk, no new hardware, do this week.
Phases 4–5 need a second machine and/or Redis: that's the "spend a little money"
tier that buys true big-tech resilience.
