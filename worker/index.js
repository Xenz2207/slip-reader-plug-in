import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { THAI_BANKS, getBangkokDateKey, getBangkokIsoNow } from '../server/services/bankMap.js';
import { createD1Repository } from './db.js';
import {
  base64ToBytes,
  hashPassword,
  verifyPassword,
  verifyFacebookSignatureWeb,
  verifyLineSignatureWeb,
} from './crypto.js';
import { checkSlipApiHealthWorker, verifyAndRecordSlipWorker } from './slipEngine.js';
import {
  buildSlipFlexMessageWorker,
  processLineEventWorker,
  sendLinePush,
} from './line.js';
import { buildMessengerReplyWorker, processMessengerEventWorker } from './messenger.js';

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Shop-Id', 'X-API-Key'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

function getRepo(c) {
  return createD1Repository(c.env.DB, c.env);
}

function getTimeoutMs(c) {
  return Number(c.env.SLIP_API_TIMEOUT_MS || 65000);
}

function extractToken(c) {
  const auth = c.req.header('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return c.req.query('token') || '';
}

async function requireUserAndShop(c, repo) {
  const token = extractToken(c);
  if (!token) {
    return { errorResponse: c.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน', authRequired: true }, 401) };
  }
  const user = await repo.getSessionUser(token);
  if (!user) {
    return {
      errorResponse: c.json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', authRequired: true }, 401),
    };
  }
  const shops = await repo.listShopsForUser(user.id);
  if (shops.length === 0) {
    const created = await repo.createShop({ ownerUserId: user.id, name: `ร้านของ ${user.displayName}` });
    shops.push(created);
  }

  const requestedShopId = Number(c.req.header('x-shop-id') || c.req.query('shopId') || 0);
  let activeShop = shops[0];
  if (requestedShopId > 0) {
    const matched = shops.find((s) => s.id === requestedShopId);
    if (!matched) {
      return {
        errorResponse: c.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลร้านค้านี้' }, 403),
      };
    }
    activeShop = matched;
  }

  return { user, shops, shop: activeShop, shopId: activeShop.id };
}

async function resolveWebhookShop(c, repo) {
  const slug = c.req.param('shopSlug') || '';
  if (slug) {
    return repo.getShopByWebhookSlug(slug);
  }
  return repo.getShopById(1);
}

// ===== PUBLIC HEALTH =====
app.get('/api/health', async (c) => {
  const baseUrl = (c.env.SLIP_API_BASE_URL || 'https://my-slip-reader.onrender.com').replace(/\/+$/, '');
  const base = {
    status: 'online',
    runtime: 'cloudflare-workers-d1',
    realtimeMode: 'polling',
    multiShop: true,
    service: 'SlipFlow Multi-Shop Seller Dashboard & Chat Plug-ins',
    version: '2.0.0',
    slipApiBaseUrl: baseUrl,
  };
  if (c.req.query('checkRemote') === '1') {
    base.remoteSlipApi = await checkSlipApiHealthWorker(baseUrl);
  }
  return c.json(base);
});

app.get('/api/events', (c) => {
  return c.json({ mode: 'polling', intervalMs: 5000 });
});

// ===== AUTH & MULTI-SHOP ENDPOINTS =====
app.post('/api/auth/register', async (c) => {
  const repo = getRepo(c);
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const shopName = String(body.shopName || '').trim();
  const displayName = String(body.displayName || shopName || username).trim();

  if (!username || username.length < 3) {
    return c.json({ error: 'ชื่อผู้ใช้งานต้องมีอย่างน้อย 3 ตัวอักษร' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);
  }
  if (!shopName) {
    return c.json({ error: 'กรุณาระบุชื่อร้านค้าของคุณ' }, 400);
  }

  const existing = await repo.findUserByUsername(username);
  if (existing) {
    return c.json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้แล้ว กรุณาใช้ชื่ออื่นหรือเข้าสู่ระบบ' }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const { user, shop } = await repo.createUserWithShop({
    username,
    displayName,
    passwordHash: hash,
    passwordSalt: salt,
    shopName,
  });
  const token = await repo.createSession(user.id);

  return c.json(
    {
      ok: true,
      token,
      user,
      shops: [shop],
      activeShopId: shop.id,
    },
    201
  );
});

app.post('/api/auth/login', async (c) => {
  const repo = getRepo(c);
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!username || !password) {
    return c.json({ error: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' }, 400);
  }

  const row = await repo.findUserByUsername(username);
  if (!row) {
    return c.json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  const valid = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!valid) {
    return c.json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  const user = await repo.getUserById(row.id);
  const shops = await repo.listShopsForUser(user.id);
  const token = await repo.createSession(user.id);

  return c.json({
    ok: true,
    token,
    user,
    shops,
    activeShopId: shops[0]?.id || null,
  });
});

app.post('/api/auth/logout', async (c) => {
  const repo = getRepo(c);
  const token = extractToken(c);
  if (token) await repo.deleteSession(token);
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({
    user: ctx.user,
    shops: ctx.shops,
    activeShopId: ctx.shopId,
  });
});

app.get('/api/shops', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ shops: ctx.shops, activeShopId: ctx.shopId });
});

app.post('/api/shops', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) {
    return c.json({ error: 'กรุณาระบุชื่อร้านค้าใหม่' }, 400);
  }
  const shop = await repo.createShop({ ownerUserId: ctx.user.id, name });
  const shops = await repo.listShopsForUser(ctx.user.id);
  return c.json({ shop, shops }, 201);
});

// ===== LINE OA WEBHOOK (PER-SHOP ISOLATED) =====
async function handleLineWebhook(c) {
  const repo = getRepo(c);
  const shop = await resolveWebhookShop(c, repo);
  if (!shop) {
    return c.json({ error: 'Shop webhook not found' }, 404);
  }
  const shopId = shop.id;
  const settings = await repo.getSettings(shopId);
  const signature = c.req.header('x-line-signature') || '';
  const rawBuf = await c.req.arrayBuffer();

  if (!settings.lineChannelSecret) {
    await repo.logWebhookEvent(shopId, {
      eventType: 'webhook',
      outcome: 'REJECTED_NO_SECRET',
      detail: 'ยังไม่ได้ตั้งค่า LINE Channel Secret ใน Dashboard ของร้านนี้',
    });
    return c.json({ error: 'LINE Channel Secret is not configured for this shop.' }, 503);
  }

  const valid = await verifyLineSignatureWeb(rawBuf, signature, settings.lineChannelSecret);
  if (!valid) {
    await repo.logWebhookEvent(shopId, {
      eventType: 'webhook',
      outcome: 'INVALID_SIGNATURE',
      detail: 'X-Line-Signature ไม่ตรงกับ Channel Secret ของร้านนี้',
    });
    return c.json({ error: 'Invalid LINE signature' }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBuf));
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const timeoutMs = getTimeoutMs(c);

  const work = (async () => {
    for (const event of events) {
      try {
        await processLineEventWorker({
          shopId,
          event,
          repo,
          timeoutMs,
          mockSlipVerify: c.env.__mockSlipVerify,
          mockLineClient: c.env.__mockLineClient,
        });
      } catch (err) {
        await repo.logWebhookEvent(shopId, {
          eventType: event?.type || 'unknown',
          sourceType: event?.source?.type || '',
          sourceId: event?.source?.groupId || event?.source?.roomId || event?.source?.userId || '',
          userId: event?.source?.userId || '',
          messageId: event?.message?.id || '',
          outcome: 'PROCESS_ERROR',
          detail: err?.message || 'เกิดข้อผิดพลาดขณะประมวลผลอีเวนต์ LINE',
        });
      }
    }
  })();

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(work);
  } else {
    await work;
  }

  return c.json({ ok: true, shopId, receivedEvents: events.length }, 200);
}

app.post('/api/line/webhook/:shopSlug', handleLineWebhook);
app.post('/api/line/webhook', handleLineWebhook);

// ===== FACEBOOK MESSENGER WEBHOOK (PER-SHOP ISOLATED) =====
async function handleMessengerGet(c) {
  const repo = getRepo(c);
  const shop = await resolveWebhookShop(c, repo);
  if (!shop) return c.text('Shop Not Found', 404);
  const shopId = shop.id;

  const settings = await repo.getSettings(shopId);
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge') || '';

  if (mode === 'subscribe' && token && token === settings.fbVerifyToken) {
    await repo.logWebhookEvent(shopId, {
      eventType: 'fb:verify',
      sourceType: 'facebook',
      outcome: 'VERIFIED_WEBHOOK',
      detail: 'ยืนยัน Facebook Messenger Webhook สำเร็จ',
    });
    return c.text(challenge, 200);
  }

  await repo.logWebhookEvent(shopId, {
    eventType: 'fb:verify',
    sourceType: 'facebook',
    outcome: 'REJECTED_VERIFY_TOKEN',
    detail: 'Verify Token ของ Facebook Messenger ไม่ตรงกับร้านนี้',
  });
  return c.text('Forbidden', 403);
}

async function handleMessengerPost(c) {
  const repo = getRepo(c);
  const shop = await resolveWebhookShop(c, repo);
  if (!shop) return c.json({ error: 'Shop webhook not found' }, 404);
  const shopId = shop.id;

  const settings = await repo.getSettings(shopId);
  const signature = c.req.header('x-hub-signature-256') || '';
  const rawBuf = await c.req.arrayBuffer();

  if (!settings.fbAppSecret) {
    await repo.logWebhookEvent(shopId, {
      eventType: 'fb:webhook',
      sourceType: 'facebook',
      outcome: 'REJECTED_NO_SECRET',
      detail: 'ยังไม่ได้ตั้งค่า Facebook App Secret ใน Dashboard ของร้านนี้',
    });
    return c.json({ error: 'Facebook App Secret is not configured for this shop.' }, 503);
  }

  const valid = await verifyFacebookSignatureWeb(rawBuf, signature, settings.fbAppSecret);
  if (!valid) {
    await repo.logWebhookEvent(shopId, {
      eventType: 'fb:webhook',
      sourceType: 'facebook',
      outcome: 'INVALID_SIGNATURE',
      detail: 'X-Hub-Signature-256 ของ Facebook ไม่ตรงกับ App Secret ของร้านนี้',
    });
    return c.json({ error: 'Invalid Facebook signature' }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBuf));
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  if (payload.object !== 'page') {
    return c.text('IGNORED', 200);
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const timeoutMs = getTimeoutMs(c);

  const work = (async () => {
    for (const entry of entries) {
      const pageId = entry?.id || '';
      const messagingList = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of messagingList) {
        try {
          await processMessengerEventWorker({
            shopId,
            pageId,
            event,
            repo,
            timeoutMs,
            mockSlipVerify: c.env.__mockSlipVerify,
            mockMessengerClient: c.env.__mockMessengerClient,
            mockLineClient: c.env.__mockLineClient,
          });
        } catch (err) {
          await repo.logWebhookEvent(shopId, {
            eventType: 'fb:message',
            sourceType: 'facebook',
            sourceId: pageId,
            userId: event?.sender?.id || '',
            messageId: event?.message?.mid || '',
            outcome: 'PROCESS_ERROR',
            detail: err?.message || 'เกิดข้อผิดพลาดขณะประมวลผลข้อความ Facebook Messenger',
          });
        }
      }
    }
  })();

  if (c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(work);
  } else {
    await work;
  }

  return c.text('EVENT_RECEIVED', 200);
}

app.get('/api/messenger/webhook/:shopSlug', handleMessengerGet);
app.post('/api/messenger/webhook/:shopSlug', handleMessengerPost);
app.get('/api/messenger/webhook', handleMessengerGet);
app.post('/api/messenger/webhook', handleMessengerPost);

// ===== CHROME EXTENSION ENDPOINTS (PER-SHOP BY EXTENSION API KEY) =====
async function resolveExtensionShop(c, repo) {
  const apiKey = c.req.header('x-api-key') || '';
  if (!apiKey) return null;
  return repo.findShopByExtensionApiKey(apiKey);
}

app.get('/api/extension/ping', async (c) => {
  const repo = getRepo(c);
  const shop = await resolveExtensionShop(c, repo);
  if (!shop) {
    return c.json(
      { error: 'API Key ของปลั๊กอินไม่ถูกต้อง กรุณาคัดลอกจากหน้า ปลั๊กอิน LINE / FB ใน Dashboard ของร้านคุณ' },
      401
    );
  }

  const [settings, summary] = await Promise.all([
    repo.getSettings(shop.id),
    repo.getDashboardSummary(shop.id, 7),
  ]);
  return c.json({
    ok: true,
    shopId: shop.id,
    shopName: settings.shopName,
    todayDate: summary.todayDate,
    todayRevenue: summary.today.revenue,
    todayVerifiedCount: summary.today.verifiedCount,
    todayAlertCount: summary.today.alertCount,
  });
});

app.post('/api/extension/verify-slip', async (c) => {
  const repo = getRepo(c);
  const shop = await resolveExtensionShop(c, repo);
  if (!shop) {
    return c.json(
      { error: 'API Key ของปลั๊กอินไม่ถูกต้อง กรุณาคัดลอกจากหน้า ปลั๊กอิน LINE / FB ใน Dashboard ของร้านคุณ' },
      401
    );
  }

  const contentType = c.req.header('content-type') || '';
  let blob;
  let filename = 'chat-slip.jpg';
  let qrPayload = '';
  let customerName = '';
  let orderNote = '';
  let lineSourceId = '';
  let platform = 'line';
  let ignoreNonSlip = false;

  if (contentType.includes('multipart/form-data')) {
    const fd = await c.req.formData();
    const file = fd.get('file');
    if (!(file instanceof Blob)) {
      return c.json({ error: 'กรุณาส่งรูปภาพสลิป' }, 400);
    }
    blob = file;
    filename = file.name || filename;
    qrPayload = String(fd.get('qr_payload') || '');
    customerName = String(fd.get('customerName') || '');
    orderNote = String(fd.get('orderNote') || '');
    lineSourceId = String(fd.get('chatRoomId') || '');
    platform = String(fd.get('platform') || 'line').toLowerCase();
    ignoreNonSlip = fd.get('ignoreNonSlip') === 'true';
  } else {
    const body = await c.req.json().catch(() => ({}));
    if (!body.imageBase64) {
      return c.json({ error: 'กรุณาส่งรูปภาพสลิป (file หรือ imageBase64)' }, 400);
    }
    const bytes = base64ToBytes(body.imageBase64);
    blob = new Blob([bytes], { type: body.mimeType || 'image/jpeg' });
    filename = body.filename || filename;
    qrPayload = String(body.qrPayload || '');
    customerName = String(body.customerName || '');
    orderNote = String(body.orderNote || '');
    lineSourceId = String(body.chatRoomId || '');
    platform = String(body.platform || 'line').toLowerCase();
    ignoreNonSlip = Boolean(body.ignoreNonSlip);
  }

  const channel = platform === 'facebook' ? 'FB_CHROME_EXT' : 'CHROME_EXT';
  const defaultCustomer = platform === 'facebook' ? 'ลูกค้าแชต Facebook' : 'ลูกค้าแชต LINE OA';

  const result = await verifyAndRecordSlipWorker({
    repo,
    shopId: shop.id,
    blob,
    filename,
    qrPayload,
    channel,
    customerName: customerName || defaultCustomer,
    lineSourceType: platform === 'facebook' ? 'facebook_web' : 'chat_web',
    lineSourceId,
    orderNote,
    skipSaveIfNonSlip: ignoreNonSlip,
    timeoutMs: getTimeoutMs(c),
    mockSlipVerify: c.env.__mockSlipVerify,
  });

  if (!result.ok) {
    return c.json({ ok: false, error: result.transportError }, 502);
  }

  return c.json({
    ok: true,
    isNonSlip: result.isNonSlip,
    message: result.apiMessage || result.transaction?.verificationMessage || '',
    transaction: result.transaction,
  });
});

// ===== DASHBOARD PROTECTED ROUTES (SCOPED BY SHOP_ID) =====
app.get('/api/banks', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ banks: Object.values(THAI_BANKS) });
});

app.get('/api/slip-api/health', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const settings = await repo.getSettings(ctx.shopId);
  return c.json(await checkSlipApiHealthWorker(settings.slipApiBaseUrl));
});

app.get('/api/summary', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const days = Math.min(90, Math.max(7, Number(c.req.query('days') || 7)));
  return c.json(await repo.getDashboardSummary(ctx.shopId, days));
});

app.get('/api/transactions', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const result = await repo.listTransactions(ctx.shopId, {
    status: c.req.query('status'),
    channel: c.req.query('channel'),
    category: c.req.query('category'),
    search: c.req.query('search'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    limit: Math.min(500, Math.max(1, Number(c.req.query('limit') || 100))),
    offset: Math.max(0, Number(c.req.query('offset') || 0)),
  });
  return c.json(result);
});

app.get('/api/transactions/export.csv', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const { items } = await repo.listTransactions(ctx.shopId, {
    status: c.req.query('status'),
    channel: c.req.query('channel'),
    category: c.req.query('category'),
    search: c.req.query('search'),
    dateFrom: c.req.query('dateFrom'),
    dateTo: c.req.query('dateTo'),
    limit: 5000,
    offset: 0,
  });

  const headers = [
    'ID',
    'วันที่บันทึก',
    'เวลาบันทึก',
    'สถานะ',
    'ช่องทาง',
    'ยอดเงิน (บาท)',
    'ธนาคารผู้โอน',
    'บัญชีผู้โอน',
    'บัญชีปลายทาง',
    'วันเวลาบนสลิป',
    'เลขอ้างอิง (transRef)',
    'ชื่อลูกค้า',
    'หมวดหมู่',
    'หมายเหตุออเดอร์',
    'ผลการตรวจ',
  ];

  const lines = [
    headers.map(csvEscape).join(','),
    ...items.map((t) =>
      [
        t.id,
        t.recordedDate,
        t.recordedAt,
        t.status,
        t.channel,
        t.amount.toFixed(2),
        t.sendingBankName,
        t.senderAccount,
        t.receiverAccount,
        t.transferDisplay,
        t.transRef,
        t.customerName,
        t.category,
        t.orderNote,
        t.verificationMessage,
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];

  const filename = `slipflow-shop-${ctx.shopId}-${getBangkokDateKey(new Date())}.csv`;
  return new Response(`\uFEFF${lines.join('\r\n')}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

app.post('/api/transactions/manual', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: 'กรุณาระบุยอดเงินที่มากกว่า 0' }, 400);
  }
  const now = getBangkokIsoNow();
  const tx = await repo.createTransaction(ctx.shopId, {
    transRef: String(body.transRef || `MANUAL-${Date.now()}`).trim(),
    status: 'VERIFIED',
    channel: 'MANUAL',
    amount,
    sendingBankName: String(body.sendingBankName || 'เงินสด / บันทึกเอง').trim(),
    transferDisplay: String(body.transferDisplay || now.slice(0, 16).replace('T', ' ')).trim(),
    recordedAt: now,
    recordedDate: String(body.recordedDate || getBangkokDateKey(now)).slice(0, 10),
    customerName: String(body.customerName || '').trim(),
    category: String(body.category || 'ขายสินค้า').trim(),
    orderNote: String(body.orderNote || '').trim(),
    verificationMessage: 'บันทึกรายรับด้วยตนเองจากหน้า Dashboard',
    checks: { manualEntry: { passed: true, detail: 'ผู้ขายบันทึกรายรับเอง' } },
  });
  return c.json({ transaction: tx }, 201);
});

app.patch('/api/transactions/:id', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  const allowedStatuses = ['VERIFIED', 'DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID', 'VOIDED'];
  if (body.status && !allowedStatuses.includes(body.status)) {
    return c.json({ error: 'สถานะไม่ถูกต้อง' }, 400);
  }
  const updated = await repo.updateTransaction(ctx.shopId, c.req.param('id'), {
    status: body.status,
    amount: body.amount !== undefined ? Number(body.amount) : undefined,
    category: body.category,
    orderNote: body.orderNote,
    customerName: body.customerName,
    verificationMessage: body.verificationMessage,
  });
  if (!updated) return c.json({ error: 'ไม่พบรายการ' }, 404);
  return c.json({ transaction: updated });
});

app.delete('/api/transactions/:id', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const ok = await repo.deleteTransaction(ctx.shopId, c.req.param('id'));
  if (!ok) return c.json({ error: 'ไม่พบรายการ' }, 404);
  return c.json({ ok: true });
});

app.post('/api/verify-slip', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const fd = await c.req.formData();
  const file = fd.get('file');
  if (!(file instanceof Blob)) {
    return c.json({ error: 'กรุณาเลือกรูปสลิปที่ต้องการตรวจสอบ' }, 400);
  }

  const result = await verifyAndRecordSlipWorker({
    repo,
    shopId: ctx.shopId,
    blob: file,
    filename: file.name || 'slip.jpg',
    qrPayload: String(fd.get('qr_payload') || ''),
    channel: fd.get('channel') === 'LINE_SIMULATOR' ? 'LINE_SIMULATOR' : 'DASHBOARD',
    customerName: String(fd.get('customerName') || ''),
    category: String(fd.get('category') || 'ขายสินค้า'),
    orderNote: String(fd.get('orderNote') || ''),
    skipSaveIfNonSlip: false,
    timeoutMs: getTimeoutMs(c),
    mockSlipVerify: c.env.__mockSlipVerify,
  });

  if (!result.ok) {
    return c.json({ ok: false, error: result.transportError }, 502);
  }

  const settings = await repo.getSettings(ctx.shopId);
  const flexMessage = result.transaction ? buildSlipFlexMessageWorker(result.transaction, settings) : null;
  return c.json({ ok: true, transaction: result.transaction, flexMessage });
});

app.post('/api/line/simulate', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const fd = await c.req.formData();
  const file = fd.get('file');
  if (!(file instanceof Blob)) {
    return c.json({ error: 'กรุณาอัปโหลดรูปสลิปเพื่อจำลองการส่งจากลูกค้า LINE' }, 400);
  }

  const settings = await repo.getSettings(ctx.shopId);
  const customerName = String(fd.get('customerName') || 'คุณลูกค้า (จำลอง LINE)').trim();
  const result = await verifyAndRecordSlipWorker({
    repo,
    shopId: ctx.shopId,
    blob: file,
    filename: file.name || 'slip.jpg',
    qrPayload: String(fd.get('qr_payload') || ''),
    channel: 'LINE_SIMULATOR',
    customerName,
    customerLineId: 'U_SIMULATOR_DEMO',
    lineSourceType: 'user',
    lineSourceId: 'U_SIMULATOR_DEMO',
    category: String(fd.get('category') || 'ขายสินค้า'),
    orderNote: String(fd.get('orderNote') || ''),
    skipSaveIfNonSlip: false,
    timeoutMs: getTimeoutMs(c),
    mockSlipVerify: c.env.__mockSlipVerify,
  });

  if (!result.ok) return c.json({ ok: false, error: result.transportError }, 502);

  const tx = result.transaction;
  const flexMessage = tx ? buildSlipFlexMessageWorker(tx, settings) : null;
  await repo.logWebhookEvent(ctx.shopId, {
    eventType: 'simulator:image',
    sourceType: 'user',
    sourceId: 'U_SIMULATOR_DEMO',
    userId: 'U_SIMULATOR_DEMO',
    customerName,
    outcome: tx?.status || 'NON_SLIP',
    detail: tx?.verificationMessage || result.apiMessage || '',
    transactionId: tx?.id ?? null,
  });

  return c.json({ ok: true, transaction: tx, flexMessage });
});

app.post('/api/messenger/simulate', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const fd = await c.req.formData();
  const file = fd.get('file');
  if (!(file instanceof Blob)) {
    return c.json({ error: 'กรุณาอัปโหลดรูปสลิปเพื่อจำลองการส่งจากลูกค้า Facebook Messenger' }, 400);
  }

  const settings = await repo.getSettings(ctx.shopId);
  const customerName = String(fd.get('customerName') || 'คุณลูกค้า (จำลอง Facebook)').trim();
  const result = await verifyAndRecordSlipWorker({
    repo,
    shopId: ctx.shopId,
    blob: file,
    filename: file.name || 'slip.jpg',
    qrPayload: String(fd.get('qr_payload') || ''),
    channel: 'FB_SIMULATOR',
    customerName,
    customerLineId: 'PSID_SIMULATOR_DEMO',
    lineSourceType: 'facebook_page',
    lineSourceId: 'PAGE_SIMULATOR_DEMO',
    category: String(fd.get('category') || 'ขายสินค้า'),
    orderNote: String(fd.get('orderNote') || ''),
    skipSaveIfNonSlip: false,
    timeoutMs: getTimeoutMs(c),
    mockSlipVerify: c.env.__mockSlipVerify,
  });

  if (!result.ok) return c.json({ ok: false, error: result.transportError }, 502);

  const tx = result.transaction;
  const replyText = tx ? buildMessengerReplyWorker(tx, settings) : '';
  await repo.logWebhookEvent(ctx.shopId, {
    eventType: 'fb:simulator',
    sourceType: 'facebook',
    sourceId: 'PAGE_SIMULATOR_DEMO',
    userId: 'PSID_SIMULATOR_DEMO',
    customerName,
    outcome: tx?.status || 'NON_SLIP',
    detail: tx?.verificationMessage || result.apiMessage || '',
    transactionId: tx?.id ?? null,
  });

  return c.json({ ok: true, transaction: tx, replyText });
});

app.get('/api/line/webhook-logs', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const limit = Math.min(100, Math.max(5, Number(c.req.query('limit') || 30)));
  return c.json({ logs: await repo.listWebhookLogs(ctx.shopId, limit) });
});

app.post('/api/line/test-push', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const settings = await repo.getSettings(ctx.shopId);
  if (!settings.lineChannelAccessToken || !settings.lineAdminNotifyTargetId) {
    return c.json(
      { error: 'กรุณากรอก LINE Channel Access Token และ Admin Target ID ให้ครบก่อนทดสอบส่งแจ้งเตือน' },
      400
    );
  }
  try {
    await sendLinePush(
      settings.lineAdminNotifyTargetId,
      [{ type: 'text', text: `✅ ทดสอบการเชื่อมต่อสำเร็จจาก ${settings.shopName} (SlipFlow)` }],
      settings.lineChannelAccessToken
    );
    return c.json({ ok: true, message: 'ส่งข้อความทดสอบไปที่ LINE เรียบร้อยแล้ว' });
  } catch (e) {
    return c.json({ error: e?.message || 'ส่งข้อความทดสอบไม่สำเร็จ' }, 502);
  }
});

// Seller accounts
app.get('/api/seller-accounts', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ accounts: await repo.listSellerAccounts(ctx.shopId) });
});

app.post('/api/seller-accounts', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  if (!body.bankName || !body.accountNumber || !body.accountName) {
    return c.json({ error: 'กรุณากรอกชื่อธนาคาร เลขบัญชี และชื่อบัญชีให้ครบถ้วน' }, 400);
  }
  const account = await repo.createSellerAccount(ctx.shopId, body);
  return c.json({ account }, 201);
});

app.patch('/api/seller-accounts/:id', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  const account = await repo.updateSellerAccount(ctx.shopId, c.req.param('id'), body);
  if (!account) return c.json({ error: 'ไม่พบบัญชีร้านค้า' }, 404);
  return c.json({ account });
});

app.delete('/api/seller-accounts/:id', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const ok = await repo.deleteSellerAccount(ctx.shopId, c.req.param('id'));
  if (!ok) return c.json({ error: 'ไม่พบบัญชีร้านค้า' }, 404);
  return c.json({ ok: true });
});

// Categories
app.get('/api/categories', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ categories: await repo.listCategories(ctx.shopId) });
});

app.post('/api/categories', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  if (!String(body.name || '').trim()) {
    return c.json({ error: 'กรุณาระบุชื่อหมวดหมู่' }, 400);
  }
  try {
    const category = await repo.createCategory(ctx.shopId, body);
    return c.json({ category }, 201);
  } catch {
    return c.json({ error: 'มีหมวดหมู่นี้อยู่แล้วในร้านนี้' }, 409);
  }
});

app.delete('/api/categories/:id', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const ok = await repo.deleteCategory(ctx.shopId, c.req.param('id'));
  if (!ok) return c.json({ error: 'ไม่สามารถลบหมวดหมู่หลักได้' }, 400);
  return c.json({ ok: true });
});

// Settings
app.get('/api/settings', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ settings: await repo.getPublicSettings(ctx.shopId) });
});

app.put('/api/settings', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  const body = await c.req.json().catch(() => ({}));
  return c.json({ settings: await repo.updateSettings(ctx.shopId, body) });
});

app.post('/api/settings/regenerate-api-key', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ extensionApiKey: await repo.regenerateExtensionApiKey(ctx.shopId) });
});

app.post('/api/settings/regenerate-fb-verify-token', async (c) => {
  const repo = getRepo(c);
  const ctx = await requireUserAndShop(c, repo);
  if (ctx.errorResponse) return ctx.errorResponse;
  return c.json({ fbVerifyToken: await repo.regenerateFbVerifyToken(ctx.shopId) });
});

// Static assets fallback for SPA
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
