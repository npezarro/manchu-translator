module.exports = {
  apps: [{
    name: 'manchu-worker',
    script: 'lib/local-worker.js',
    autorestart: true,
    max_memory_restart: '500M',
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    env: {
      NODE_ENV: 'production',
      WORKER_PORT: 3111
    }
  }]
};
