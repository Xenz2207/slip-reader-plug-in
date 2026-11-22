import express from 'express';
import { verifyFacebookSignature, buildMessengerSlipReply } from '../services/messengerService.js';
import { buildSlipFlexMessage } from '../services/lineService.js';
import { verifyAndRecordSlip } from '../services/verificationEngine.js';

export function createMessengerWebhookRouter({ db, slipClient, messengerClient, lineClient, hub }) {
  const router = express.Router();

  // Meta Webhook Verification Handshake (GET)
  router.get('/', (req, res) => {
    const settings = db.getSettings();
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && token === settings.fbVerifyToken) {
      db.logWebhookEvent({
        eventType: 'fb:verify',
        sourceType: 'facebook',
        outcome: 'VERIFIED_WEBHOOK',
        detail: 'ยืนยัน Facebook Messenger Webhook สำเร็จ',
      });
      hub?.broadcast('webhook:logged', { outcome: 'VERIFIED_WEBHOOK' });
      return res.status(200).send(String(challenge || ''));
    }

    db.logWebhookEvent({
      eventType: 'fb:verify',
      sourceType: 'facebook',
      outcome: 'REJECTED_VERIFY_TOKEN',
      detail: 'Verify Token ของ Facebook Messenger ไม่ตรงกัน',
    });
    return res.status(403).send('Forbidden');
  });

  // Meta Webhook Events (POST) — raw body for exact X-Hub-Signature-256 verification
  router.post('/', express.raw({ type: 'application/json', limit: '3mb' }), async (req, res) => {
    const settings = db.getSettings();
    const signature = req.header('x-hub-signature-256') || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    if (!settings.fbAppSecret) {
      db.logWebhookEvent({
        eventType: 'fb:webhook',
        sourceType: 'facebook',
        outcome: 'REJECTED_NO_SECRET',
        detail: 'ยังไม่ได้ตั้งค่า Facebook App Secret ใน Dashboard',
      });
      return res.status(503).json({ error: 'Facebook App Secret is not configured yet.' });
    }

    if (!verifyFacebookSignature(rawBody, signature, settings.fbAppSecret)) {
      db.logWebhookEvent({
        eventType: 'fb:webhook',
        sourceType: 'facebook',
        outcome: 'INVALID_SIGNATURE',
        detail: 'X-Hub-Signature-256 ของ Facebook ไม่ถูกต้อง',
      });
      return res.status(401).json({ error: 'Invalid Facebook signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    if (payload.object !== 'page') {
      return res.status(200).send('IGNORED');
    }

    // Respond 200 immediately so Meta never retries during Render cold-start OCR
    res.status(200).send('EVENT_RECEIVED');

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const pageId = entry?.id || '';
      const messagingList = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of messagingList) {
        processMessengerEvent({
          pageId,
          event,
          db,
          slipClient,
          messengerClient,
          lineClient,
          hub,
        }).catch((err) => {
          db.logWebhookEvent({
            eventType: 'fb:message',
            sourceType: 'facebook',
            sourceId: pageId,
            userId: event?.sender?.id || '',
            messageId: event?.message?.mid || '',
            outcome: 'PROCESS_ERROR',
            detail: err?.message || 'เกิดข้อผิดพลาดขณะประมวลผลข้อความ Facebook Messenger',
          });
          hub?.broadcast('webhook:logged', { outcome: 'PROCESS_ERROR' });
        });
      }
    }
  });

  return router;
}

export async function processMessengerEvent({
  pageId,
  event,
  db,
  slipClient,
  messengerClient,
  lineClient,
  hub,
}) {
  const message = event?.message;
  if (!message || message.is_echo) {
    // Never process echo messages sent by the Page itself
    return;
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const imageAttachments = attachments.filter((att) => att?.type === 'image' && att?.payload?.url);
  if (imageAttachments.length === 0) {
    return;
  }

  const settings = db.getSettings();
  const senderPsid = event?.sender?.id || '';
  const messageId = message.mid || '';

  const customerName =
    (await messengerClient.fetchUserProfile(senderPsid, settings.fbPageAccessToken)) ||
    'ลูกค้า Facebook';

  for (const att of imageAttachments) {
    const img = await messengerClient.downloadAttachmentImage(att.payload.url);
    const result = await verifyAndRecordSlip({
      db,
      slipClient,
      hub,
      buffer: img.buffer,
      filename: img.filename,
      mimeType: img.mimeType,
      channel: 'FB_MESSENGER',
      customerName,
      customerLineId: senderPsid,
      lineSourceType: 'facebook_page',
      lineSourceId: pageId || senderPsid,
      lineMessageId: messageId,
      skipSaveIfNonSlip: settings.fbIgnoreNonSlip,
    });

    if (!result.ok) {
      db.logWebhookEvent({
        eventType: 'fb:image',
        sourceType: 'facebook',
        sourceId: pageId,
        userId: senderPsid,
        customerName,
        messageId,
        outcome: 'API_ERROR',
        detail: result.transportError,
      });
      hub?.broadcast('webhook:logged', { outcome: 'API_ERROR' });
      continue;
    }

    if (result.isNonSlip && !result.transaction) {
      db.logWebhookEvent({
        eventType: 'fb:image',
        sourceType: 'facebook',
        sourceId: pageId,
        userId: senderPsid,
        customerName,
        messageId,
        outcome: 'IGNORED_NON_SLIP',
        detail: result.apiMessage || 'รูปภาพทั่วไปบน Messenger (ไม่พบ QR สลิป) ข้ามการตอบกลับอัตโนมัติ',
      });
      hub?.broadcast('webhook:logged', { outcome: 'IGNORED_NON_SLIP' });
      continue;
    }

    const tx = result.transaction;
    const replyText = buildMessengerSlipReply(tx, settings);

    const shouldReply =
      settings.fbAutoReplyEnabled &&
      Boolean(settings.fbPageAccessToken) &&
      Boolean(senderPsid) &&
      (tx.status === 'VERIFIED' || settings.fbReplyOnError);

    let replyDetail = settings.fbPageAccessToken
      ? 'ปิดตอบกลับอัตโนมัติ'
      : 'ยังไม่ได้ใส่ Page Access Token จึงไม่ได้ตอบกลับในแชต';

    if (shouldReply) {
      try {
        await messengerClient.sendTextMessage(senderPsid, replyText, settings.fbPageAccessToken);
        replyDetail = 'ส่งข้อความยืนยันกลับใน Messenger สำเร็จ';
      } catch (err) {
        replyDetail = `บันทึกสำเร็จแต่ตอบกลับ Messenger ไม่สำเร็จ: ${err.message}`;
      }
    }

    // Optional cross-channel alert to seller's LINE Admin Group
    if (
      settings.fbNotifyLineAdmin &&
      settings.lineAdminNotifyTargetId &&
      settings.lineChannelAccessToken &&
      lineClient
    ) {
      try {
        const flexMsg = buildSlipFlexMessage(
          { ...tx, customerName: `${tx.customerName} (Facebook)` },
          settings
        );
        await lineClient.pushMessage(
          settings.lineAdminNotifyTargetId,
          [flexMsg],
          settings.lineChannelAccessToken
        );
        replyDetail += ' · แจ้งเตือนเข้ากลุ่ม LINE แอดมินแล้ว';
      } catch (err) {
        replyDetail += ` · แจ้ง LINE แอดมินไม่สำเร็จ (${err.message})`;
      }
    }

    db.logWebhookEvent({
      eventType: 'fb:image',
      sourceType: 'facebook',
      sourceId: pageId,
      userId: senderPsid,
      customerName: tx.customerName,
      messageId,
      outcome: tx.status,
      detail: `${tx.verificationMessage} (${replyDetail})`,
      transactionId: tx.id,
    });
    hub?.broadcast('webhook:logged', { outcome: tx.status, transactionId: tx.id });
  }
}
