import { formatBaht } from '../server/services/bankMap.js';
import { verifyAndRecordSlipWorker } from './slipEngine.js';
import { buildSlipFlexMessageWorker, sendLinePush } from './line.js';

export function buildMessengerReplyWorker(tx, settings = {}) {
  const shopName = settings.shopName || 'ร้านค้าของเรา';
  const greeting = settings.fbReplyGreeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ';

  if (tx.status === 'VERIFIED') {
    return [
      `✅ [${shopName}] ยืนยันยอดโอนสำเร็จ`,
      `━━━━━━━━━━━━━━`,
      `ยอดเงิน: ${formatBaht(tx.amount)} บาท`,
      `ธนาคารผู้โอน: ${tx.sendingBankName || '-'}`,
      `วันเวลาที่โอน: ${tx.transferDisplay || '-'}`,
      `บัญชีปลายทาง: ${tx.receiverAccount || '-'}`,
      `เลขอ้างอิง: ${tx.transRef || '-'}`,
      `━━━━━━━━━━━━━━`,
      greeting,
    ].join('\n');
  }

  if (tx.status === 'DUPLICATE') {
    return [
      `⚠️ [${shopName}] ตรวจพบสลิปซ้ำในระบบ`,
      `เลขอ้างอิง: ${tx.transRef || '-'}`,
      tx.verificationMessage || 'สลิปนี้เคยถูกบันทึกเข้าระบบไปแล้ว กรุณาตรวจสอบอีกครั้ง',
    ].join('\n');
  }

  if (tx.status === 'WRONG_ACCOUNT') {
    return [
      `⚠️ [${shopName}] บัญชีปลายทางไม่ตรงกับร้านค้า`,
      `ยอดเงินบนสลิป: ${formatBaht(tx.amount)} บาท`,
      `บัญชีปลายทางที่ตรวจพบ: ${tx.receiverAccount || '-'}`,
      tx.verificationMessage || 'กรุณาตรวจสอบเลขบัญชีปลายทางและติดต่อแอดมิน',
    ].join('\n');
  }

  if (tx.status === 'NEEDS_REVIEW') {
    return [
      `🕒 [${shopName}] ได้รับรูปสลิปแล้ว (รอแอดมินตรวจสอบยอดเงิน)`,
      `เลขอ้างอิง: ${tx.transRef || '-'}`,
      tx.verificationMessage || 'ระบบส่งเรื่องให้แอดมินตรวจสอบเพิ่มเติมแล้วครับ',
    ].join('\n');
  }

  return [
    `❌ [${shopName}] ตรวจสอบสลิปไม่ผ่าน`,
    tx.verificationMessage || 'กรุณาส่งภาพสลิปต้นฉบับที่มี QR Code ชัดเจนอีกครั้งครับ',
  ].join('\n');
}

async function downloadAttachmentBlob(url, mockClient) {
  if (mockClient?.downloadAttachmentImage) {
    const r = await mockClient.downloadAttachmentImage(url);
    return {
      blob: new Blob([r.buffer], { type: r.mimeType || 'image/jpeg' }),
      filename: r.filename || 'fb_slip.jpg',
    };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`ดาวน์โหลดรูปจาก Facebook Messenger ไม่สำเร็จ (HTTP ${res.status})`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const blob = await res.blob();
  return { blob, filename: `fb_slip_${Date.now()}.${ext}` };
}

async function fetchFbProfileName(psid, pageAccessToken, mockClient) {
  if (mockClient?.fetchUserProfile) {
    return mockClient.fetchUserProfile(psid, pageAccessToken);
  }
  if (!psid || !pageAccessToken) return '';
  try {
    const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(psid)}?fields=first_name,last_name,name&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const data = await res.json();
    if (data.name) return String(data.name).trim();
    return [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  } catch {
    return '';
  }
}

async function sendFbTextMessage(psid, text, pageAccessToken, mockClient) {
  if (mockClient?.sendTextMessage) {
    return mockClient.sendTextMessage(psid, text, pageAccessToken);
  }
  const endpoint = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_type: 'RESPONSE',
      recipient: { id: psid },
      message: { text },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Meta Send API error ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

export async function processMessengerEventWorker({
  shopId,
  pageId,
  event,
  repo,
  timeoutMs,
  mockSlipVerify,
  mockMessengerClient,
  mockLineClient,
}) {
  const message = event?.message;
  if (!message || message.is_echo) return;

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const imageAttachments = attachments.filter((att) => att?.type === 'image' && att?.payload?.url);
  if (imageAttachments.length === 0) return;

  const settings = await repo.getSettings(shopId);
  const senderPsid = event?.sender?.id || '';
  const messageId = message.mid || '';
  const customerName =
    (await fetchFbProfileName(senderPsid, settings.fbPageAccessToken, mockMessengerClient)) ||
    'ลูกค้า Facebook';

  for (const att of imageAttachments) {
    const img = await downloadAttachmentBlob(att.payload.url, mockMessengerClient);
    const result = await verifyAndRecordSlipWorker({
      repo,
      shopId,
      blob: img.blob,
      filename: img.filename,
      channel: 'FB_MESSENGER',
      customerName,
      customerLineId: senderPsid,
      lineSourceType: 'facebook_page',
      lineSourceId: pageId || senderPsid,
      lineMessageId: messageId,
      skipSaveIfNonSlip: settings.fbIgnoreNonSlip,
      timeoutMs,
      mockSlipVerify,
    });

    if (!result.ok) {
      await repo.logWebhookEvent(shopId, {
        eventType: 'fb:image',
        sourceType: 'facebook',
        sourceId: pageId,
        userId: senderPsid,
        customerName,
        messageId,
        outcome: 'API_ERROR',
        detail: result.transportError,
      });
      continue;
    }

    if (result.isNonSlip && !result.transaction) {
      await repo.logWebhookEvent(shopId, {
        eventType: 'fb:image',
        sourceType: 'facebook',
        sourceId: pageId,
        userId: senderPsid,
        customerName,
        messageId,
        outcome: 'IGNORED_NON_SLIP',
        detail: result.apiMessage || 'รูปภาพทั่วไปบน Messenger (ไม่พบ QR สลิป) ข้ามการตอบกลับอัตโนมัติ',
      });
      continue;
    }

    const tx = result.transaction;
    const replyText = buildMessengerReplyWorker(tx, settings);

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
        await sendFbTextMessage(senderPsid, replyText, settings.fbPageAccessToken, mockMessengerClient);
        replyDetail = 'ส่งข้อความยืนยันกลับใน Messenger สำเร็จ';
      } catch (err) {
        replyDetail = `บันทึกสำเร็จแต่ตอบกลับ Messenger ไม่สำเร็จ: ${err.message}`;
      }
    }

    if (
      settings.fbNotifyLineAdmin &&
      settings.lineAdminNotifyTargetId &&
      settings.lineChannelAccessToken
    ) {
      try {
        const flexMsg = buildSlipFlexMessageWorker(
          { ...tx, customerName: `${tx.customerName} (Facebook)` },
          settings
        );
        await sendLinePush(
          settings.lineAdminNotifyTargetId,
          [flexMsg],
          settings.lineChannelAccessToken,
          mockLineClient
        );
        replyDetail += ' · แจ้งเตือนเข้ากลุ่ม LINE แอดมินแล้ว';
      } catch (err) {
        replyDetail += ` · แจ้ง LINE แอดมินไม่สำเร็จ (${err.message})`;
      }
    }

    await repo.logWebhookEvent(shopId, {
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
  }
}
