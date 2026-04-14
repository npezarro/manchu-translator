module.exports = {
  apps: [{
    name: 'manchu-translator',
    script: 'server.js',
    autorestart: true,
    max_memory_restart: '200M',
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3110
    }
  }]
};
