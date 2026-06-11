module.exports = {
  apps: [
    {
      name: 'fuel-order-api',
      script: 'dist/entrypoint.js',

      // Single instance — cluster mode would break socket.io and session state
      instances: 1,
      exec_mode: 'fork',

      // Restart policy
      autorestart: true,
      max_restarts: 10,       // give up after 10 rapid crashes (prevents restart loop)
      min_uptime: '10s',      // a start counts as stable only if it lives 10s
      restart_delay: 2000,    // wait 2s between restarts

      // Restart if process leaks memory past 512 MB
      max_memory_restart: '512M',

      watch: false,           // don't restart on file changes (production)

      // Environment — only overrides that differ from your .env
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
