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

      // Environment — only overrides that differ from your .env
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
