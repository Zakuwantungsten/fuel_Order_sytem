# Attack spike + 503/530 incident runbook

Use this when you receive a **block_spike** critical email or staff report they cannot log in.

## What the email means

**"Elevated attack volume: N IPs blocked in X min"** — your auto-block system blocked many scanner/brute-force IPs in a short window. The defense worked. Default threshold is **100 blocks / 10 minutes** (`SECURITY_BLOCK_SPIKE_THRESHOLD`).

This email goes **only to you** when `SECURITY_ALERT_EMAIL` and `SECURITY_ALERT_EMAIL_ONLY=true` are set.

## If staff see login failures (503 / 530)

Cloudflare returns **503/530** when it cannot reach your Ubuntu origin — this is **not** a wrong password.

Check in order:

1. **Cloudflare dashboard** — Tunnel / origin status
2. **Ubuntu: cloudflared** — `sudo systemctl status cloudflared` → restart if down
3. **Backend process** — pm2 / systemd / Docker — must be running
4. **nginx** — `sudo systemctl status nginx`
5. **Local health** — `curl http://127.0.0.1:5000/api/health`
6. **Readiness (Mongo)** — `curl http://127.0.0.1:5000/api/health/ready`

## If origin is up but some users get errors

Collateral auto-block on a shared mobile/office IP:

```bash
cd /path/to/backend
npm run unblock-ips
```

Or HTTP emergency unblock (requires `SECURITY_EMERGENCY_UNBLOCK_TOKEN` in `.env`):

```bash
curl -X POST https://www.tahfuelorder.dev/api/v1/security/emergency-unblock \
  -H "X-Emergency-Token: YOUR_SECRET"
```

## Production `.env` security knobs

```env
SECURITY_ALERT_EMAIL=you@yourdomain.com
SECURITY_ALERT_EMAIL_ONLY=true
SECURITY_BLOCK_SPIKE_THRESHOLD=100
SECURITY_SUSPICIOUS_THRESHOLD=10
SECURITY_404_COUNT_THRESHOLD=50
TRUSTED_ADMIN_IPS=YOUR.PUBLIC.IP/32
SECURITY_EMERGENCY_UNBLOCK_TOKEN=<64-char hex secret>
```

Generate token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Cloudflare WAF — auth rate limit (apply in dashboard)

**Security → WAF → Rate limiting rules → Create rule**

- **Name:** Auth endpoint protection
- **Expression:**
  ```
  (http.request.uri.path contains "/api/v1/auth/" or http.request.uri.path contains "/api/auth/")
  ```
- **Action:** Managed Challenge (or Block)
- **Rate:** 30 requests per minute per IP

Also enable **Bot Fight Mode** and **WAF managed rules**.

## What staff should see

End users (drivers, clerks, managers) see only:

> Service temporarily unavailable. Please try again in a moment.

They are **not** told about attacks, IP blocks, or security events.

## Ubuntu service resilience

Ensure auto-restart on all layers:

- `cloudflared`: `Restart=always` in systemd unit
- Node backend: pm2 `autorestart` or systemd `Restart=always`
- nginx: `Restart=always`
- Docker: `restart: unless-stopped`

Monitor publicly: `GET https://www.tahfuelorder.dev/api/health/ready` → alert **your phone/email only**.

## What the code does now

| Control | Behavior |
|---------|----------|
| Logged-in users (valid JWT) | Never hard IP-blocked |
| Path/404/UA probes | 403 on bad request only — no IP-wide ban |
| Auth brute-force | Short IP block (10 min default) |
| Rate limits | Skip authenticated + trusted IPs; auth limit only on flagged/blocked IPs |
| Block spike alert | Fires at 100+ auto-blocks / 10 min (configurable) |
| MFA | Required for `admin` + `super_admin` only |
