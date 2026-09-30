module.exports = {
  apps: [
    {
      name: 'nibolbot-api',
      script: 'apps/api/src/index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        BOT_SERVICE_URL: 'http://localhost:3001'
      }
    },
    {
      name: 'nibolbot-bot',
      script: 'apps/bot/src/index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        API_URL: process.env.API_URL || 'https://nibol.my.id'
      }
    }
  ]
};
