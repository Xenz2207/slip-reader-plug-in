import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { createD1SqliteAdapter } from './d1SqliteAdapter.js';
import { createD1Repository } from '../worker/db.js';
import workerApp from '../worker/index.js';

export function createApp(options = {}) {
  const d1 = options.d1 || createD1SqliteAdapter(options.dbPath || config.databasePath);
  const env = {
    DB: d1,
    SLIP_API_BASE_URL: config.slipApiBaseUrl,
    SLIP_API_TIMEOUT_MS: String(config.slipApiTimeoutMs),
    __mockSlipVerify: options.slipClient ? (args) => options.slipClient.verifySlipImage(args) : null,
    __mockLineClient: options.lineClient || null,
    __mockMessengerClient: options.messengerClient || null,
  };
  const repo = createD1Repository(d1, env);

  const app = express();
  app.set('trust proxy', 1);

  // Forward all /api/* requests directly to the Hono Cloudflare Worker app
  app.use('/api', express.raw({ type: '*/*', limit: '16mb' }), async (req, res) => {
    try {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `localhost:${config.port}`;
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) {
          headers.set(k, v.join(', '));
        } else if (typeof v === 'string') {
          headers.set(k, v);
        }
      }

      const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
      const rawBody =
        hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined;

      const webReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body: rawBody,
      });

      const pendingTasks = [];
      const executionCtx = {
        waitUntil(promise) {
          pendingTasks.push(Promise.resolve(promise).catch(() => {}));
        },
      };

      const webRes = await workerApp.fetch(webReq, env, executionCtx);
      if (pendingTasks.length > 0) {
        await Promise.all(pendingTasks);
      }
      res.status(webRes.status);
      webRes.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });
      const buf = Buffer.from(await webRes.arrayBuffer());
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
  });

  const clientDistDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  return { app, db: d1, repo };
}
