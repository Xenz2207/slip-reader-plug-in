import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { createDatabase } from './db.js';
import { createSlipReaderClient } from './services/slipReaderClient.js';
import { createLineClient } from './services/lineService.js';
import { createMessengerClient } from './services/messengerService.js';
import { SseHub, sseHub } from './services/sseHub.js';
import { createLineWebhookRouter } from './routes/lineWebhook.js';
import { createMessengerWebhookRouter } from './routes/messengerWebhook.js';
import { createApiRouter } from './routes/api.js';

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const slipClient = options.slipClient || createSlipReaderClient();
  const lineClient = options.lineClient || createLineClient();
  const messengerClient = options.messengerClient || createMessengerClient();
  const hub = options.hub || (options.db ? new SseHub() : sseHub);

  const app = express();
  app.set('trust proxy', 1);

  // CORS allowing local dev, Chrome Extensions, and LINE OA Manager web chat
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          origin.startsWith('chrome-extension://') ||
          origin === 'https://chat.line.biz' ||
          origin === 'https://manager.line.biz'
        ) {
          return cb(null, true);
        }
        return cb(null, true);
      },
      credentials: true,
    })
  );

  // Mount LINE & Facebook Messenger webhooks BEFORE global express.json() so raw body stays intact for HMAC checks
  app.use('/api/line/webhook', createLineWebhookRouter({ db, slipClient, lineClient, hub }));
  app.use(
    '/api/messenger/webhook',
    createMessengerWebhookRouter({ db, slipClient, messengerClient, lineClient, hub })
  );

  // JSON & form parsing for normal API routes (15mb allows base64 slip uploads from Chrome Extension)
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.use('/api', createApiRouter({ db, slipClient, lineClient, messengerClient, hub }));

  // Serve built React frontend in production / single-service mode
  const clientDistDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  // Centralized error handler (e.g. multer size limit)
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'ไฟล์รูปภาพใหญ่เกิน 12MB กรุณาย่อขนาดก่อนอัปโหลด' });
    }
    res.status(500).json({ error: err?.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  });

  return { app, db, slipClient, lineClient, hub };
}
