module.exports = {
  apps: [
    {
      name: 'fuel-order-api',
      script: 'dist/entrypoint.js',

      // Two workers on the same Ubuntu box. PM2 balances HTTP across them.
      // Socket.io needs Redis (REDIS_URL) — adapter is attached in websocket.ts.
      // Crons / change-streams / DB monitor run only on worker 0 (see workerRole.ts).
      instances: 2,
      exec_mode: 'cluster',

      // Per-worker heap. With 2 workers + Mongo + Redis on ~7–8 GB RAM, keep each
      // Node process modest so WiredTiger still has room.
      node_args: '--max-old-space-size=1024',

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,

      // Leak backstop per worker (~1 GB heap + overhead)
      max_memory_restart: '1400M',

      watch: false,

      // App drains in-flight requests up to 15s (server.ts). Give that room.
      kill_timeout: 16000,

      wait_ready: true,
      listen_timeout: 30000,

      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
