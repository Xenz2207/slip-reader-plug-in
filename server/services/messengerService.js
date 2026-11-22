import crypto from 'node:crypto';
import { formatBaht } from './bankMap.js';

export function verifyFacebookSignature(rawBodyBuffer, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBodyBuffer) {
    return false;
  }
  const sig = String(signatureHeader).trim();
  if (!sig.startsWith('sha256=')) {
    return false;
  }
  const receivedHex = sig.slice('sha256='.length);
  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBodyBuffer)
    .digest('hex');

  const receivedBuf = Buffer.from(receivedHex, 'utf8');
  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

export function buildMessengerSlipReply(tx, settings = {}) {
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

export function createMessengerClient() {
  async function downloadAttachmentImage(url) {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`ดาวน์โหลดรูปจาก Facebook Messenger ไม่สำเร็จ (HTTP ${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
      filename: `fb_slip_${Date.now()}.${ext}`,
    };
  }

  async function fetchUserProfile(psid, pageAccessToken) {
    if (!psid || !pageAccessToken) return '';
    try {
      const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(psid)}?fields=first_name,last_name,name&access_token=${encodeURIComponent(pageAccessToken)}`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return '';
      const data = await res.json();
      if (data.name) return String(data.name).trim();
      const combined = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      return combined;
    } catch {
      return '';
    }
  }

  async function sendTextMessage(psid, text, pageAccessToken) {
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
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Meta Send API error ${res.status}: ${bodyText}`);
    }
    return true;
  }

  return {
    downloadAttachmentImage,
    fetchUserProfile,
    sendTextMessage,
  };
}
