import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { verifyAndRecordSlip } from '../services/verificationEngine.js';
import { buildSlipFlexMessage } from '../services/lineService.js';
import { buildMessengerSlipReply } from '../services/messengerService.js';
import { getBangkokDateKey, getBangkokIsoNow, THAI_BANKS } from '../services/bankMap.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function createApiRouter({ db, slipClient, lineClient, hub }) {
  const router = express.Router();

  // Optional Dashboard Access Key middleware (only enforced if DASHBOARD_ACCESS_KEY env var is set)
  function requireDashboardAuth(req, res, next) {
    if (!config.dashboardAccessKey) return next();
    const provided = req.header('x-dashboard-key') || req.query.dashboardKey || '';
    if (provided === config.dashboardAccessKey) return next();
    return res.status(401).json({ error: 'ต้องระบุ Dashboard Access Key ให้ถูกต้อง' });
  }

  // Extension API Key middleware
  function requireExtensionKey(req, res, next) {
    const settings = db.getSettings();
    const provided = req.header('x-api-key') || '';
    if (!provided || provided !== settings.extensionApiKey) {
      return res.status(401).json({ error: 'API Key ของปลั๊กอินไม่ถูกต้อง กรุณาคัดลอกจากหน้า LINE Plug-in ใน Dashboard' });
    }
    return next();
  }

  // Public health check
  router.get('/health', async (req, res) => {
    const settings = db.getSettings();
    const base = {
      status: 'online',
      service: 'SlipFlow Seller Dashboard & LINE Plug-in',
      version: '1.0.0',
      slipApiBaseUrl: settings.slipApiBaseUrl,
      sseClients: hub?.clientCount || 0,
      dashboardProtected: Boolean(config.dashboardAccessKey),
    };
    if (req.query.checkRemote === '1') {
      base.remoteSlipApi = await slipClient.checkHealth(settings.slipApiBaseUrl);
    }
    res.json(base);
  });

  // ===== CHROME EXTENSION ENDPOINTS (Protected by X-API-Key) =====
  router.get('/extension/ping', requireExtensionKey, (req, res) => {
    const settings = db.getSettings();
    const summary = db.getDashboardSummary(7);
    res.json({
      ok: true,
      shopName: settings.shopName,
      todayDate: summary.todayDate,
      todayRevenue: summary.today.revenue,
      todayVerifiedCount: summary.today.verifiedCount,
      todayAlertCount: summary.today.alertCount,
    });
  });

  router.post('/extension/verify-slip', requireExtensionKey, upload.single('file'), async (req, res) => {
    try {
      let buffer;
      let mimeType = 'image/jpeg';
      let filename = 'line-chat-slip.jpg';
      let qrPayload = '';
      let customerName = '';
      let orderNote = '';
      let lineSourceId = '';

      if (req.file) {
        buffer = req.file.buffer;
        mimeType = req.file.mimetype || 'image/jpeg';
        filename = req.file.originalname || 'line-chat-slip.jpg';
        qrPayload = req.body?.qr_payload || '';
        customerName = req.body?.customerName || '';
        orderNote = req.body?.orderNote || '';
        lineSourceId = req.body?.chatRoomId || '';
      } else if (req.body?.imageBase64) {
        const rawB64 = String(req.body.imageBase64).replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(rawB64, 'base64');
        mimeType = req.body.mimeType || 'image/jpeg';
        filename = req.body.filename || 'line-chat-slip.jpg';
        qrPayload = req.body.qrPayload || '';
        customerName = req.body.customerName || '';
        orderNote = req.body.orderNote || '';
        lineSourceId = req.body.chatRoomId || '';
      } else {
        return res.status(400).json({ error: 'กรุณาส่งรูปภาพสลิป (file หรือ imageBase64)' });
      }

      const platform = String(req.body?.platform || 'line').toLowerCase();
      const channel = platform === 'facebook' ? 'FB_CHROME_EXT' : 'CHROME_EXT';
      const defaultCustomer = platform === 'facebook' ? 'ลูกค้าแชต Facebook' : 'ลูกค้าแชต LINE OA';

      const result = await verifyAndRecordSlip({
        db,
        slipClient,
        hub,
        buffer,
        filename,
        mimeType,
        qrPayload,
        channel,
        customerName: customerName || defaultCustomer,
        lineSourceType: platform === 'facebook' ? 'facebook_web' : 'chat_web',
        lineSourceId,
        orderNote,
        skipSaveIfNonSlip: Boolean(req.body?.ignoreNonSlip),
      });

      if (!result.ok) {
        return res.status(502).json({ ok: false, error: result.transportError });
      }

      res.json({
        ok: true,
        isNonSlip: result.isNonSlip,
        message: result.apiMessage || result.transaction?.verificationMessage || '',
        transaction: result.transaction,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'เกิดข้อผิดพลาดในการตรวจสลิป' });
    }
  });

  // ===== DASHBOARD ROUTES =====
  router.use(requireDashboardAuth);

  router.get('/events', (req, res) => {
    hub.addClient(res);
  });

  router.get('/banks', (_req, res) => {
    res.json({ banks: Object.values(THAI_BANKS) });
  });

  router.get('/slip-api/health', async (_req, res) => {
    const settings = db.getSettings();
    const health = await slipClient.checkHealth(settings.slipApiBaseUrl);
    res.json(health);
  });

  router.get('/summary', (req, res) => {
    const days = Math.min(90, Math.max(7, Number(req.query.days || 7)));
    res.json(db.getDashboardSummary(days));
  });

  // Transactions
  router.get('/transactions', (req, res) => {
    const result = db.listTransactions({
      status: req.query.status,
      channel: req.query.channel,
      category: req.query.category,
      search: req.query.search,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      limit: Math.min(500, Math.max(1, Number(req.query.limit || 100))),
      offset: Math.max(0, Number(req.query.offset || 0)),
    });
    res.json(result);
  });

  router.get('/transactions/export.csv', (req, res) => {
    const { items } = db.listTransactions({
      status: req.query.status,
      channel: req.query.channel,
      category: req.query.category,
      search: req.query.search,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
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

    const filename = `slipflow-revenue-${getBangkokDateKey(new Date())}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Prefix UTF-8 BOM so Thai renders cleanly in Microsoft Excel
    res.send(`\uFEFF${lines.join('\r\n')}`);
  });

  router.post('/transactions/manual', (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'กรุณาระบุยอดเงินที่มากกว่า 0' });
    }
    const now = getBangkokIsoNow();
    const tx = db.createTransaction({
      transRef: String(req.body?.transRef || `MANUAL-${Date.now()}`).trim(),
      status: 'VERIFIED',
      channel: 'MANUAL',
      amount,
      sendingBankName: String(req.body?.sendingBankName || 'เงินสด / บันทึกเอง').trim(),
      transferDisplay: String(req.body?.transferDisplay || now.slice(0, 16).replace('T', ' ')).trim(),
      recordedAt: now,
      recordedDate: String(req.body?.recordedDate || getBangkokDateKey(now)).slice(0, 10),
      customerName: String(req.body?.customerName || '').trim(),
      category: String(req.body?.category || 'ขายสินค้า').trim(),
      orderNote: String(req.body?.orderNote || '').trim(),
      verificationMessage: 'บันทึกรายรับด้วยตนเองจากหน้า Dashboard',
      checks: {
        manualEntry: { passed: true, detail: 'ผู้ขายบันทึกรายรับเอง' },
      },
    });
    hub.broadcast('transaction:created', tx);
    res.status(201).json({ transaction: tx });
  });

  router.patch('/transactions/:id', (req, res) => {
    const allowedStatuses = ['VERIFIED', 'DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID', 'VOIDED'];
    if (req.body?.status && !allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }
    const updated = db.updateTransaction(req.params.id, {
      status: req.body?.status,
      amount: req.body?.amount !== undefined ? Number(req.body.amount) : undefined,
      category: req.body?.category,
      orderNote: req.body?.orderNote,
      customerName: req.body?.customerName,
      verificationMessage: req.body?.verificationMessage,
    });
    if (!updated) return res.status(404).json({ error: 'ไม่พบรายการ' });
    hub.broadcast('transaction:updated', updated);
    res.json({ transaction: updated });
  });

  router.delete('/transactions/:id', (req, res) => {
    const deleted = db.deleteTransaction(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'ไม่พบรายการ' });
    hub.broadcast('transaction:deleted', { id: Number(req.params.id) });
    res.json({ ok: true });
  });

  // Verify slip directly from Dashboard
  router.post('/verify-slip', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาเลือกรูปสลิปที่ต้องการตรวจสอบ' });
    }
    const result = await verifyAndRecordSlip({
      db,
      slipClient,
      hub,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      qrPayload: req.body?.qr_payload || '',
      channel: req.body?.channel === 'LINE_SIMULATOR' ? 'LINE_SIMULATOR' : 'DASHBOARD',
      customerName: req.body?.customerName || '',
      category: req.body?.category || 'ขายสินค้า',
      orderNote: req.body?.orderNote || '',
      skipSaveIfNonSlip: false,
    });

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.transportError });
    }

    const settings = db.getSettings();
    const flexMessage = result.transaction ? buildSlipFlexMessage(result.transaction, settings) : null;

    res.json({
      ok: true,
      transaction: result.transaction,
      flexMessage,
    });
  });

  // LINE Slip Simulator (tests the exact LINE webhook flow + returns Flex Message preview without sending to LINE API)
  router.post('/line/simulate', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดรูปสลิปเพื่อจำลองการส่งจากลูกค้า LINE' });
    }
    const settings = db.getSettings();
    const customerName = String(req.body?.customerName || 'คุณลูกค้า (จำลอง LINE)').trim();
    const result = await verifyAndRecordSlip({
      db,
      slipClient,
      hub,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      qrPayload: req.body?.qr_payload || '',
      channel: 'LINE_SIMULATOR',
      customerName,
      customerLineId: 'U_SIMULATOR_DEMO',
      lineSourceType: 'user',
      lineSourceId: 'U_SIMULATOR_DEMO',
      category: req.body?.category || 'ขายสินค้า',
      orderNote: req.body?.orderNote || '',
      skipSaveIfNonSlip: false,
    });

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.transportError });
    }

    const tx = result.transaction;
    const flexMessage = tx ? buildSlipFlexMessage(tx, settings) : null;

    db.logWebhookEvent({
      eventType: 'simulator:image',
      sourceType: 'user',
      sourceId: 'U_SIMULATOR_DEMO',
      userId: 'U_SIMULATOR_DEMO',
      customerName,
      outcome: tx?.status || 'NON_SLIP',
      detail: tx?.verificationMessage || result.apiMessage || '',
      transactionId: tx?.id ?? null,
    });
    hub.broadcast('webhook:logged', { outcome: tx?.status || 'NON_SLIP' });

    res.json({
      ok: true,
      transaction: tx,
      flexMessage,
    });
  });

  // Facebook Messenger Slip Simulator
  router.post('/messenger/simulate', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัปโหลดรูปสลิปเพื่อจำลองการส่งจากลูกค้า Facebook Messenger' });
    }
    const settings = db.getSettings();
    const customerName = String(req.body?.customerName || 'คุณลูกค้า (จำลอง Facebook)').trim();
    const result = await verifyAndRecordSlip({
      db,
      slipClient,
      hub,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      qrPayload: req.body?.qr_payload || '',
      channel: 'FB_SIMULATOR',
      customerName,
      customerLineId: 'PSID_SIMULATOR_DEMO',
      lineSourceType: 'facebook_page',
      lineSourceId: 'PAGE_SIMULATOR_DEMO',
      category: req.body?.category || 'ขายสินค้า',
      orderNote: req.body?.orderNote || '',
      skipSaveIfNonSlip: false,
    });

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.transportError });
    }

    const tx = result.transaction;
    const replyText = tx ? buildMessengerSlipReply(tx, settings) : '';

    db.logWebhookEvent({
      eventType: 'fb:simulator',
      sourceType: 'facebook',
      sourceId: 'PAGE_SIMULATOR_DEMO',
      userId: 'PSID_SIMULATOR_DEMO',
      customerName,
      outcome: tx?.status || 'NON_SLIP',
      detail: tx?.verificationMessage || result.apiMessage || '',
      transactionId: tx?.id ?? null,
    });
    hub.broadcast('webhook:logged', { outcome: tx?.status || 'NON_SLIP' });

    res.json({
      ok: true,
      transaction: tx,
      replyText,
    });
  });

  router.post('/settings/regenerate-fb-verify-token', (_req, res) => {
    const fbVerifyToken = db.regenerateFbVerifyToken();
    res.json({ fbVerifyToken });
  });

  router.get('/line/webhook-logs', (req, res) => {
    const limit = Math.min(100, Math.max(5, Number(req.query.limit || 30)));
    res.json({ logs: db.listWebhookLogs(limit) });
  });

  router.post('/line/test-push', async (_req, res) => {
    const settings = db.getSettings();
    if (!settings.lineChannelAccessToken || !settings.lineAdminNotifyTargetId) {
      return res.status(400).json({
        error: 'กรุณากรอก LINE Channel Access Token และ Admin Target ID ให้ครบก่อนทดสอบส่งแจ้งเตือน',
      });
    }
    try {
      await lineClient.pushMessage(
        settings.lineAdminNotifyTargetId,
        [
          {
            type: 'text',
            text: `✅ ทดสอบการเชื่อมต่อสำเร็จจาก ${settings.shopName} (SlipFlow LINE Plug-in)`,
          },
        ],
        settings.lineChannelAccessToken
      );
      res.json({ ok: true, message: 'ส่งข้อความทดสอบไปที่ LINE เรียบร้อยแล้ว' });
    } catch (err) {
      res.status(502).json({ error: err?.message || 'ส่งข้อความทดสอบไม่สำเร็จ' });
    }
  });

  // Seller Bank Accounts
  router.get('/seller-accounts', (_req, res) => {
    res.json({ accounts: db.listSellerAccounts() });
  });

  router.post('/seller-accounts', (req, res) => {
    const { bankCode, bankName, accountNumber, accountName, accountType } = req.body || {};
    if (!bankName || !accountNumber || !accountName) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อธนาคาร เลขบัญชี และชื่อบัญชีให้ครบถ้วน' });
    }
    const account = db.createSellerAccount({
      bankCode: bankCode || '004',
      bankName,
      accountNumber,
      accountName,
      accountType,
    });
    res.status(201).json({ account });
  });

  router.patch('/seller-accounts/:id', (req, res) => {
    const updated = db.updateSellerAccount(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'ไม่พบบัญชีร้านค้า' });
    res.json({ account: updated });
  });

  router.delete('/seller-accounts/:id', (req, res) => {
    const ok = db.deleteSellerAccount(req.params.id);
    if (!ok) return res.status(404).json({ error: 'ไม่พบบัญชีร้านค้า' });
    res.json({ ok: true });
  });

  // Categories
  router.get('/categories', (_req, res) => {
    res.json({ categories: db.listCategories() });
  });

  router.post('/categories', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อหมวดหมู่' });
    try {
      const category = db.createCategory({ name, color: req.body?.color || '#0D6B4E' });
      res.status(201).json({ category });
    } catch {
      res.status(409).json({ error: 'มีหมวดหมู่นี้อยู่แล้ว' });
    }
  });

  router.delete('/categories/:id', (req, res) => {
    const ok = db.deleteCategory(req.params.id);
    if (!ok) return res.status(400).json({ error: 'ไม่สามารถลบหมวดหมู่หลักได้' });
    res.json({ ok: true });
  });

  // Settings
  router.get('/settings', (_req, res) => {
    res.json({ settings: db.getPublicSettings() });
  });

  router.put('/settings', (req, res) => {
    const updated = db.updateSettings(req.body || {});
    res.json({ settings: updated });
  });

  router.post('/settings/regenerate-api-key', (_req, res) => {
    const extensionApiKey = db.regenerateExtensionApiKey();
    res.json({ extensionApiKey });
  });

  return router;
}
