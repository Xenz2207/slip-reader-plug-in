import { config } from './config.js';
import { createApp } from './app.js';

const { app, db } = createApp();

const server = app.listen(config.port, () => {
  console.log(`\n⚡ SlipFlow Seller Dashboard & Chat Plug-ins (LINE + Facebook Messenger)`);
  console.log(`   Dashboard:         http://localhost:${config.port}`);
  console.log(`   LINE Webhook:      http://localhost:${config.port}/api/line/webhook`);
  console.log(`   Messenger Webhook: http://localhost:${config.port}/api/messenger/webhook`);
  console.log(`   Slip API:          ${config.slipApiBaseUrl}`);
  console.log(`   Database:          ${config.databasePath}\n`);
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
