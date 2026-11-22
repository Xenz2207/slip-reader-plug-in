import { formatBaht } from '../server/services/bankMap.js';
import { verifyAndRecordSlipWorker } from './slipEngine.js';

export function buildSlipFlexMessageWorker(tx, settings = {}) {
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
          { type: 'text', text: shopName, color: '#FFFFFFCC', size: 'xs', weight: 'bold' },
          { type: 'text', text: cfg.badge, color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'xs' },
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
              { type: 'text', text: 'จำนวนเงิน', size: 'xs', color: '#52645D' },
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
                { type: 'text', text: row.label, color: '#52645D', size: 'xs', flex: 4 },
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
        contents: [{ type: 'text', text: cfg.footerText, size: 'xs', color: '#3A4A44', wrap: true }],
      },
    },
  };
}

export async function sendLineReply(replyToken, messages, accessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`LINE Reply API error ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

export async function sendLinePush(to, messages, accessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`LINE Push API error ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

async function downloadLineImageBlob(messageId, accessToken) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`LINE Get Content ล้มเหลว (HTTP ${res.status})`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const blob = await res.blob();
  return { blob, filename: `line_${messageId}.${ext}` };
}

async function fetchLineDisplayName({ userId, sourceType, sourceId, accessToken }) {
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

export async function processLineEventWorker({ event, repo, timeoutMs }) {
  const settings = await repo.getSettings();
  const sourceType = event?.source?.type || 'user';
  const userId = event?.source?.userId || '';
  const sourceId = event?.source?.groupId || event?.source?.roomId || userId || '';

  if (event?.type === 'message' && event?.message?.type === 'text') {
    const text = String(event.message.text || '').trim().toLowerCase();
    if (text === '!id' || text === '!group' || text === '!เช็กไอดี') {
      if (settings.lineChannelAccessToken && event.replyToken) {
        await sendLineReply(
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
      await repo.logWebhookEvent({
        eventType: 'message:text',
        sourceType,
        sourceId,
        userId,
        messageId: event.message.id,
        outcome: 'REPLIED_TARGET_ID',
        detail: `ตอบกลับ Target ID (${sourceId})`,
      });
    }
    return;
  }

  if (event?.type !== 'message' || event?.message?.type !== 'image') return;

  const messageId = event.message.id;
  if (!settings.lineChannelAccessToken) {
    await repo.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      messageId,
      outcome: 'MISSING_ACCESS_TOKEN',
      detail: 'ยังไม่ได้ตั้งค่า LINE Channel Access Token จึงดึงรูปสลิปไม่ได้',
    });
    return;
  }

  const [img, customerName] = await Promise.all([
    downloadLineImageBlob(messageId, settings.lineChannelAccessToken),
    fetchLineDisplayName({ userId, sourceType, sourceId, accessToken: settings.lineChannelAccessToken }),
  ]);

  const result = await verifyAndRecordSlipWorker({
    repo,
    blob: img.blob,
    filename: img.filename,
    channel: 'LINE_BOT',
    customerName: customerName || 'ลูกค้า LINE',
    customerLineId: userId,
    lineSourceType: sourceType,
    lineSourceId: sourceId,
    lineMessageId: messageId,
    skipSaveIfNonSlip: settings.lineIgnoreNonSlip,
    timeoutMs,
  });

  if (!result.ok) {
    await repo.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      customerName,
      messageId,
      outcome: 'API_ERROR',
      detail: result.transportError,
    });
    return;
  }

  if (result.isNonSlip && !result.transaction) {
    await repo.logWebhookEvent({
      eventType: 'message:image',
      sourceType,
      sourceId,
      userId,
      customerName,
      messageId,
      outcome: 'IGNORED_NON_SLIP',
      detail: result.apiMessage || 'รูปภาพทั่วไป (ไม่พบ QR สลิป) ข้ามการตอบกลับอัตโนมัติ',
    });
    return;
  }

  const tx = result.transaction;
  const flexMsg = buildSlipFlexMessageWorker(tx, settings);
  const shouldReply =
    settings.lineAutoReplyEnabled && (tx.status === 'VERIFIED' || settings.lineReplyOnError);

  let replyDetail = 'ปิดตอบกลับอัตโนมัติ';
  if (shouldReply) {
    try {
      await sendLineReply(event.replyToken, [flexMsg], settings.lineChannelAccessToken);
      replyDetail = 'ส่ง Flex Message สำเร็จ';
    } catch {
      if (sourceId) {
        try {
          await sendLinePush(sourceId, [flexMsg], settings.lineChannelAccessToken);
          replyDetail = 'ส่ง Flex Message (Push Fallback)';
        } catch (err) {
          replyDetail = `บันทึกสำเร็จแต่ตอบกลับ LINE ไม่สำเร็จ: ${err.message}`;
        }
      }
    }
  }

  const adminTarget = settings.lineAdminNotifyTargetId;
  const shouldNotifyAdmin =
    Boolean(adminTarget) &&
    adminTarget !== sourceId &&
    ((tx.status === 'VERIFIED' && settings.lineNotifyAdminOnVerified) ||
      (tx.status !== 'VERIFIED' && settings.lineNotifyAdminOnAlert));

  if (shouldNotifyAdmin) {
    try {
      await sendLinePush(adminTarget, [flexMsg], settings.lineChannelAccessToken);
      replyDetail += ' · แจ้งเตือนแอดมินแล้ว';
    } catch (err) {
      replyDetail += ` · แจ้งเตือนแอดมินไม่สำเร็จ (${err.message})`;
    }
  }

  await repo.logWebhookEvent({
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
}
