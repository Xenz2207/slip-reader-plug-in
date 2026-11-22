import crypto from 'node:crypto';
import { formatBaht } from './bankMap.js';

export function verifyLineSignature(rawBodyBuffer, signatureHeader, channelSecret) {
  if (!channelSecret || !signatureHeader || !rawBodyBuffer) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBodyBuffer)
    .digest('base64');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(String(signatureHeader).trim(), 'utf8');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export function buildSlipFlexMessage(tx, settings = {}) {
  const shopName = settings.shopName || 'ร้านค้าของเรา';
  const greeting = settings.lineReplyGreeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ';

  const statusConfig = {
    VERIFIED: {
      headerBg: '#0D6B4E',
      badge: 'ยืนยันยอดโอนสำเร็จ',
      altText: `ยืนยันยอดโอน ${formatBaht(tx.amount)} บาท (${tx.sendingBankName || 'ธนาคาร'})`,
      amountColor: '#0D6B4E',
      footerText: greeting,
    },
    DUPLICATE: {
      headerBg: '#C82829',
      badge: 'ตรวจพบสลิปซ้ำในระบบ',
      altText: `แจ้งเตือน: พบสลิปซ้ำ เลขอ้างอิง ${tx.transRef || '-'}`,
      amountColor: '#C82829',
      footerText: tx.verificationMessage || 'สลิปนี้เคยถูกบันทึกเข้าระบบไปแล้ว กรุณาตรวจสอบอีกครั้ง',
    },
    WRONG_ACCOUNT: {
      headerBg: '#C82829',
      badge: 'บัญชีปลายทางไม่ตรงร้านค้า',
      altText: `แจ้งเตือน: สลิปโอนเข้าบัญชีไม่ตรงกับร้าน (${tx.receiverAccount || '-'})`,
      amountColor: '#C82829',
      footerText: tx.verificationMessage || 'กรุณาตรวจสอบเลขบัญชีปลายทางอีกครั้ง',
    },
    NEEDS_REVIEW: {
      headerBg: '#B45309',
      badge: 'รอผู้ขายตรวจสอบยอดเงิน',
      altText: `แจ้งเตือน: สลิปรอตรวจสอบยอดเงิน (${tx.transRef || '-'})`,
      amountColor: '#B45309',
      footerText: tx.verificationMessage || 'ระบบอ่านสลิปได้แล้ว แต่ยอดเงินต้องให้แอดมินยืนยันเพิ่มเติม',
    },
    INVALID: {
      headerBg: '#C82829',
      badge: 'ตรวจสอบสลิปไม่ผ่าน',
      altText: `สลิปไม่ผ่านการตรวจสอบ: ${tx.verificationMessage || 'โปรดส่งรูปสลิปที่ชัดเจน'}`,
      amountColor: '#C82829',
      footerText: tx.verificationMessage || 'กรุณาส่งภาพสลิปต้นฉบับที่มี QR Code ชัดเจนอีกครั้ง',
    },
  };

  const cfg = statusConfig[tx.status] || statusConfig.INVALID;

  const infoRows = [
    { label: 'ธนาคารผู้โอน', value: tx.sendingBankName || '-' },
    { label: 'วันเวลาที่โอน', value: tx.transferDisplay || '-' },
    { label: 'บัญชีปลายทาง', value: tx.receiverAccount || '-' },
    { label: 'เลขอ้างอิง', value: tx.transRef || '-' },
  ];

  if (tx.customerName) {
    infoRows.unshift({ label: 'ผู้ส่งสลิป', value: tx.customerName });
  }

  return {
    type: 'flex',
    altText: cfg.altText.slice(0, 390),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: cfg.headerBg,
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: shopName,
            color: '#FFFFFFCC',
            size: 'xs',
            weight: 'bold',
          },
          {
            type: 'text',
            text: cfg.badge,
            color: '#FFFFFF',
            size: 'lg',
            weight: 'bold',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: 'จำนวนเงิน',
                size: 'xs',
                color: '#52645D',
              },
              {
                type: 'text',
                text: `${formatBaht(tx.amount)} บาท`,
                size: 'xxl',
                weight: 'bold',
                color: cfg.amountColor,
                margin: 'xs',
              },
            ],
          },
          { type: 'separator', color: '#E3E8E5' },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: infoRows.map((row) => ({
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: row.label,
                  color: '#52645D',
                  size: 'xs',
                  flex: 4,
                },
                {
                  type: 'text',
                  text: String(row.value),
                  color: '#10201A',
                  size: 'xs',
                  weight: 'bold',
                  flex: 6,
                  wrap: true,
                  align: 'end',
                },
              ],
            })),
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F4F6F5',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: cfg.footerText,
            size: 'xs',
            color: '#3A4A44',
            wrap: true,
          },
        ],
      },
    },
  };
}

export function createLineClient() {
  async function downloadImageContent(messageId, accessToken) {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`LINE Get Content ล้มเหลว (HTTP ${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
      filename: `line_${messageId}.${ext}`,
    };
  }

  async function fetchProfile({ userId, sourceType, sourceId, accessToken }) {
    if (!userId || !accessToken) return '';
    let endpoint = `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`;
    if (sourceType === 'group' && sourceId) {
      endpoint = `https://api.line.me/v2/bot/group/${encodeURIComponent(sourceId)}/member/${encodeURIComponent(userId)}`;
    } else if (sourceType === 'room' && sourceId) {
      endpoint = `https://api.line.me/v2/bot/room/${encodeURIComponent(sourceId)}/member/${encodeURIComponent(userId)}`;
    }
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.displayName || '';
    } catch {
      return '';
    }
  }

  async function replyMessage(replyToken, messages, accessToken) {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ replyToken, messages }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LINE Reply API error ${res.status}: ${text}`);
    }
    return true;
  }

  async function pushMessage(to, messages, accessToken) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to, messages }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LINE Push API error ${res.status}: ${text}`);
    }
    return true;
  }

  async function replyOrPush({ replyToken, targetId, messages, accessToken }) {
    if (replyToken) {
      try {
        await replyMessage(replyToken, messages, accessToken);
        return { method: 'reply' };
      } catch (err) {
        if (targetId) {
          await pushMessage(targetId, messages, accessToken);
          return { method: 'push_fallback', replyError: err.message };
        }
        throw err;
      }
    }
    if (targetId) {
      await pushMessage(targetId, messages, accessToken);
      return { method: 'push' };
    }
    return { method: 'none' };
  }

  return {
    downloadImageContent,
    fetchProfile,
    replyMessage,
    pushMessage,
    replyOrPush,
  };
}
