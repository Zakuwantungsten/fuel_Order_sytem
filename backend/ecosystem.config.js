module.exports = {
  apps: [
    {
      name: 'fuel-order-api',
      script: 'dist/entrypoint.js',

      // Single instance — cluster mode would break socket.io and session state
      instances: 1,
      exec_mode: 'fork',

      // Let V8 grow its heap to 2 GB before it OOMs. Default (~1.5 GB on 64-bit)
      // forces premature GC thrashing and crashes under heavy query/export load.
      // NOTE: MongoDB runs on this same 8 GB box (~3.5 GB for WiredTiger), so the
      // Node process is intentionally NOT given the full machine.
      node_args: '--max-old-space-size=2048',

      // Restart policy
      autorestart: true,
      max_restarts: 10,       // give up after 10 rapid crashes (prevents restart loop)
      min_uptime: '10s',      // a start counts as stable only if it lives 10s
      restart_delay: 2000,    // wait 2s between restarts

      // Safety valve: restart only if RSS exceeds 2.5 GB (heap can reach ~2 GB via
      // --max-old-space-size, plus buffers/code overhead). This is a leak backstop,
      // NOT a routine ceiling — at 568 MB the old 512 MB limit was restarting the
      // app mid-day during normal use. Co-located MongoDB keeps us off the full 8 GB.
      max_memory_restart: '2560M',

      watch: false,           // don't restart on file changes (production)

      // ── Graceful restart (Phase 3) ──────────────────────────────────────────
      // The app's SIGINT/SIGTERM handler drains in-flight requests for up to 15s
      // (server.ts). PM2's DEFAULT kill_timeout is only 1600ms — so by default PM2
      // SIGKILLs the process at 1.6s, cutting the drain short and dropping live
      // requests on every restart. 16s gives the 15s drain room to finish first.
      kill_timeout: 16000,

      // Don't mark the new process "online" until it actually signals readiness
      // (process.send('ready') after httpServer.listen — see server.ts). Prevents
      // PM2 from declaring success while DB connect / seeds / backfill are still
      // running and the app can't yet serve traffic.
      wait_ready: true,
      // Startup does real work before listening (DB connect, firewall seed,
      // monthKey backfill, Redis, websocket, change streams). Give it generous
      // headroom so a slow first-boot backfill isn't mistaken for a failed start.
      listen_timeout: 30000,

      // Environment — only overrides that differ from your .env
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
