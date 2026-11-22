import express from 'express';
import { verifyLineSignature, buildSlipFlexMessage } from '../services/lineService.js';
import { verifyAndRecordSlip } from '../services/verificationEngine.js';

export function createLineWebhookRouter({ db, slipClient, lineClient, hub }) {
  const router = express.Router();

  // Raw body parser exclusively for LINE webhook so HMAC-SHA256 verification matches exact payload bytes
  router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
    const settings = db.getSettings();
    const signature = req.header('x-line-signature') || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    if (!settings.lineChannelSecret) {
      db.logWebhookEvent({
        eventType: 'webhook',
        outcome: 'REJECTED_NO_SECRET',
        detail: 'ยังไม่ได้ตั้งค่า LINE Channel Secret ใน Dashboard',
      });
      return res.status(503).json({
        error: 'LINE Channel Secret is not configured yet.',
      });
    }

    if (!verifyLineSignature(rawBody, signature, settings.lineChannelSecret)) {
      db.logWebhookEvent({
        eventType: 'webhook',
        outcome: 'INVALID_SIGNATURE',
        detail: 'X-Line-Signature ไม่ถูกต้อง',
      });
      return res.status(401).json({ error: 'Invalid LINE signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const events = Array.isArray(payload.events) ? payload.events : [];

    // Respond 200 OK immediately so LINE never times out during Render cold-start OCR verification
    res.status(200).json({ ok: true, receivedEvents: events.length });

    // Process events asynchronously
    for (const event of events) {
      processLineEvent({ event, db, slipClient, lineClient, hub }).catch((err) => {
        db.logWebhookEvent({
          eventType: event?.type || 'unknown',
          sourceType: event?.source?.type || '',
          sourceId: event?.source?.groupId || event?.source?.roomId || event?.source?.userId || '',
          userId: event?.source?.userId || '',
          messageId: event?.message?.id || '',
          outcome: 'PROCESS_ERROR',
          detail: err?.message || 'เกิดข้อผิดพลาดขณะประมวลผลอีเวนต์ LINE',
        });
        hub?.broadcast('webhook:logged', { outcome: 'PROCESS_ERROR' });
      });
    }
  });

  return router;
}

export async function processLineEvent({ event, db, slipClient, lineClient, hub }) {
  const settings = db.getSettings();
  const sourceType = event?.source?.type || 'user';
  const userId = event?.source?.userId || '';
  const sourceId = event?.source?.groupId || event?.source?.roomId || userId || '';

  // Allow sellers to discover their Group ID / User ID by typing "!id" or "!เช็กไอดี" in LINE
  if (event?.type === 'message' && event?.message?.type === 'text') {
    const text = String(event.message.text || '').trim().toLowerCase();
    if (text === '!id' || text === '!group' || text === '!เช็กไอดี') {
      if (settings.lineChannelAccessToken && event.replyToken) {
        await lineClient.replyMessage(
          event.replyToken,
          [
            {
              type: 'text',
              text: `ข้อมูลห้องแชตนี้ (สำหรับตั้งค่าแจ้งเตือนแอดมิน):\n• ประเภทห้อง: ${sourceType}\n• Target ID: ${sourceId}\n• User ID: ${userId || '-'}`,
            },
          ],
          settings.lineChannelAccessToken
        );
      }
      db.logWebhookEvent({
        eventType: 'message:text',
        sourceType,
        sourceId,
        userId,
        messageId: event.message.id,
        outcome: 'REPLIED_TARGET_ID',
        detail: `ตอบกลับ Target ID (${sourceId})`,
      });
      hub?.broadcast('webhook:logged', { outcome: 'REPLIED_TARGET_ID' });
    }
    return;
  }

  if (event?.type !== 'message' || event?.message?.type !== 'image') {
    return;
  }

  const messageId = event.message.id;
  if (!settings.lineChannelAccessToken) {
    db.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      messageId,
      outcome: 'MISSING_ACCESS_TOKEN',
      detail: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token จึงดึงรูปสลิปไม่ได้',
    });
    hub?.broadcast('webhook:logged', { outcome: 'MISSING_ACCESS_TOKEN' });
    return;
  }

  const [img, customerName] = await Promise.all([
    lineClient.downloadImageContent(messageId, settings.lineChannelAccessToken),
    lineClient.fetchProfile({
      userId,
      sourceType,
      sourceId,
      accessToken: settings.lineChannelAccessToken,
    }),
  ]);

  const result = await verifyAndRecordSlip({
    db,
    slipClient,
    hub,
    buffer: img.buffer,
    filename: img.filename,
    mimeType: img.mimeType,
    channel: 'LINE_BOT',
    customerName: customerName || 'ลูกค้า LINE',
    customerLineId: userId,
    lineSourceType: sourceType,
    lineSourceId: sourceId,
    lineMessageId: messageId,
    skipSaveIfNonSlip: settings.lineIgnoreNonSlip,
  });

  if (!result.ok) {
    db.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      customerName,
      messageId,
      outcome: 'API_ERROR',
      detail: result.transportError,
    });
    hub?.broadcast('webhook:logged', { outcome: 'API_ERROR' });
    return;
  }

  if (result.isNonSlip && !result.transaction) {
    db.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      customerName,
      messageId,
      outcome: 'IGNORED_NON_SLIP',
      detail: result.apiMessage || 'รูปภาพทั่วไป (ไม่พบ QR สลิป) ข้ามการตอบกลับอัตโนมัติ',
    });
    hub?.broadcast('webhook:logged', { outcome: 'IGNORED_NON_SLIP' });
    return;
  }

  const tx = result.transaction;
  const flexMsg = buildSlipFlexMessage(tx, settings);

  // Reply to customer/group chat if configured
  const shouldReply =
    settings.lineAutoReplyEnabled &&
    (tx.status === 'VERIFIED' || settings.lineReplyOnError);

  let replyDetail = 'ปิดตอบกลับอัตโนมัติ';
  if (shouldReply) {
    try {
      const sent = await lineClient.replyOrPush({
        replyToken: event.replyToken,
        targetId: sourceId,
        messages: [flexMsg],
        accessToken: settings.lineChannelAccessToken,
      });
      replyDetail = sent.method === 'push_fallback' ? 'ส่ง Flex Message (Push Fallback)' : 'ส่ง Flex Message สำเร็จ';
    } catch (err) {
      replyDetail = `บันทึกสำเร็จแต่ตอบกลับ LINE ไม่สำเร็จ: ${err.message}`;
    }
  }

  // Optional admin group push notification
  const adminTarget = settings.lineAdminNotifyTargetId;
  const shouldNotifyAdmin =
    Boolean(adminTarget) &&
    adminTarget !== sourceId &&
    ((tx.status === 'VERIFIED' && settings.lineNotifyAdminOnVerified) ||
      (tx.status !== 'VERIFIED' && settings.lineNotifyAdminOnAlert));

  if (shouldNotifyAdmin) {
    try {
      await lineClient.pushMessage(adminTarget, [flexMsg], settings.lineChannelAccessToken);
      replyDetail += ' · แจ้งเตือนแอดมินแล้ว';
    } catch (err) {
      replyDetail += ` · แจ้งเตือนแอดมินไม่สำเร็จ (${err.message})`;
    }
  }

  db.logWebhookEvent({
    eventType: 'message:image',
    sourceType,
    sourceId,
    userId,
    customerName: tx.customerName,
    messageId,
    outcome: tx.status,
    detail: `${tx.verificationMessage} (${replyDetail})`,
    transactionId: tx.id,
  });
  hub?.broadcast('webhook:logged', { outcome: tx.status, transactionId: tx.id });
}
