import { resolveBankLabel, getBangkokIsoNow, getBangkokDateKey, formatBaht } from '../server/services/bankMap.js';
import {
  matchReceiverAccount,
  detectRemoteDuplicate,
  detectNonSlipResponse,
} from '../server/services/verificationEngine.js';

export async function checkSlipApiHealthWorker(baseUrl) {
  const cleanUrl = (baseUrl || 'https://my-slip-reader.onrender.com').replace(/\/+$/, '');
  const t0 = Date.now();
  try {
    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - t0;
    const body = await res.json().catch(() => ({}));
    return {
      online: res.ok && body.status === 'online',
      httpStatus: res.status,
      baseUrl: cleanUrl,
      service: body.service || 'Thai Slip Reader API',
      version: body.version || '-',
      ocrEngine: body.ocrEngine || '-',
      latencyMs,
    };
  } catch (err) {
    return {
      online: false,
      httpStatus: 0,
      baseUrl: cleanUrl,
      service: 'Thai Slip Reader API',
      version: '-',
      ocrEngine: '-',
      latencyMs: Date.now() - t0,
      error: err?.message || 'เชื่อมต่อ API ไม่ได้',
    };
  }
}

export async function callSlipReaderApi({
  blob,
  filename = 'slip.jpg',
  qrPayload = '',
  source = 'api',
  baseUrl = 'https://my-slip-reader.onrender.com',
  timeoutMs = 65000,
}) {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const url = `${cleanUrl}/api/verify-slip?source=${encodeURIComponent(source)}`;

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const fd = new FormData();
      fd.append('file', blob, filename || 'slip.jpg');
      if (qrPayload && String(qrPayload).trim()) {
        fd.append('qr_payload', String(qrPayload).trim());
      }

      const res = await fetch(url, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const elapsedMs = Date.now() - t0;

      if ([502, 503, 504].includes(res.status) && attempt === 1) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      const payload = await res.json().catch(() => null);
      if (!payload || typeof payload !== 'object') {
        return {
          ok: false,
          httpStatus: res.status,
          elapsedMs,
          transportError: `Slip Reader API คืนค่าไม่ถูกต้อง (HTTP ${res.status})`,
          payload: null,
        };
      }
      return { ok: true, httpStatus: res.status, elapsedMs, transportError: null, payload };
    } catch (err) {
      lastError = err;
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      return {
        ok: false,
        httpStatus: 0,
        elapsedMs: Date.now() - t0,
        transportError:
          err?.name === 'TimeoutError'
            ? 'หมดเวลาการเชื่อมต่อ Slip Reader API (อาจกำลังปลุกเซิร์ฟเวอร์ Render โปรดลองอีกครั้ง)'
            : `เชื่อมต่อ Slip Reader API ไม่สำเร็จ: ${err?.message || 'Unknown error'}`,
        payload: null,
      };
    }
  }
  return {
    ok: false,
    httpStatus: 0,
    elapsedMs: 0,
    transportError: lastError?.message || 'เชื่อมต่อ Slip Reader API ไม่สำเร็จ',
    payload: null,
  };
}

export async function verifyAndRecordSlipWorker({
  repo,
  blob,
  filename = 'slip.jpg',
  qrPayload = '',
  channel = 'DASHBOARD',
  customerName = '',
  customerLineId = '',
  lineSourceType = '',
  lineSourceId = '',
  lineMessageId = '',
  category = 'ขายสินค้า',
  orderNote = '',
  skipSaveIfNonSlip = false,
  timeoutMs = 65000,
}) {
  const [settings, sellerAccounts] = await Promise.all([
    repo.getSettings(),
    repo.listSellerAccounts(),
  ]);

  const sourceMap = {
    LINE_BOT: 'line',
    LINE_SIMULATOR: 'line-sim',
    FB_MESSENGER: 'messenger',
    FB_SIMULATOR: 'messenger-sim',
    CHROME_EXT: 'chrome-ext',
    FB_CHROME_EXT: 'fb-chrome-ext',
    DASHBOARD: 'dashboard',
  };

  const remote = await callSlipReaderApi({
    blob,
    filename,
    qrPayload,
    source: sourceMap[channel] || 'api',
    baseUrl: settings.slipApiBaseUrl,
    timeoutMs,
  });

  if (!remote.ok || !remote.payload) {
    return {
      ok: false,
      transportError: remote.transportError || 'ไม่สามารถติดต่อ Slip Reader API ได้',
      isNonSlip: false,
      transaction: null,
    };
  }

  const payload = remote.payload;
  const processingMs = Number(payload.processingTimeMs || remote.elapsedMs || 0);
  const isNonSlip = detectNonSlipResponse(payload);
  if (isNonSlip && skipSaveIfNonSlip) {
    return {
      ok: true,
      transportError: null,
      isNonSlip: true,
      apiMessage: payload.message || 'ไม่พบ QR Code ในรูปภาพ',
      transaction: null,
    };
  }

  const d = payload.data || {};
  const transRef = String(d.transRef || payload.transRef || '').trim();
  const amount = Number(d.amount || 0);
  const bankCode = String(d.sendingBankCode || '').trim();
  const bankName = resolveBankLabel(bankCode, d.sendingBankEng);
  const senderAccount = String(d.senderAccount || '').trim();
  const receiverAccount = String(d.receiverAccount || '').trim();
  const transferDisplay = String(d.transferDisplay || d.transferTime || '').trim();
  const transferIso = String(d.transferIso || '').trim();
  const ocrLines = Array.isArray(d.ocrExtractedLines) ? d.ocrExtractedLines : [];
  const tlvBreakdown = Array.isArray(d.tlvBreakdown) ? d.tlvBreakdown : [];

  const existingLocalDuplicate = transRef ? await repo.findVerifiedByTransRef(transRef) : null;
  const isRemoteDuplicate = !payload.success && detectRemoteDuplicate(payload);

  const receiverCheck = settings.checkReceiverAccount
    ? matchReceiverAccount(receiverAccount, ocrLines, sellerAccounts)
    : {
        matched: true,
        skipped: true,
        account: null,
        reason: 'ปิดการตรวจบัญชีปลายทางไว้ในการตั้งค่า',
      };

  const checks = {
    qrAndCrc: {
      passed: Boolean(payload.success),
      detail: payload.success
        ? `CRC ${d.crcHex || '-'} ถูกต้อง ตรงตามมาตรฐาน Thai QR`
        : payload.message || 'ไม่ผ่านการตรวจ QR / CRC จาก Slip Reader API',
    },
    notDuplicate: {
      passed: !(existingLocalDuplicate || isRemoteDuplicate),
      detail: existingLocalDuplicate
        ? `พบเลขอ้างอิงซ้ำกับรายการ #${existingLocalDuplicate.id} (บันทึกเมื่อ ${existingLocalDuplicate.recordedAt})`
        : isRemoteDuplicate
          ? payload.message || 'ระบบ Slip Reader ตรวจพบว่าสลิปนี้เคยถูกส่งตรวจแล้ว'
          : 'ไม่พบประวัติสลิปซ้ำ',
    },
    receiverAccount: {
      passed: receiverCheck.matched,
      skipped: Boolean(receiverCheck.skipped),
      detail: receiverCheck.reason,
    },
    validAmount: {
      passed: amount > 0 && amount >= Number(settings.minAmount || 0),
      detail:
        amount <= 0
          ? 'อ่านยอดเงินได้ 0.00 บาท กรุณาตรวจสอบข้อความ OCR และกรอกยอดยืนยันเอง'
          : amount < Number(settings.minAmount || 0)
            ? `ยอดเงิน ${formatBaht(amount)} บาท ต่ำกว่ายอดขั้นต่ำที่ตั้งไว้ (${formatBaht(settings.minAmount)} บาท)`
            : `ยอดโอน ${formatBaht(amount)} บาท`,
    },
  };

  let status = 'VERIFIED';
  let verificationMessage = 'ตรวจสลิปผ่านและบันทึกรายรับอัตโนมัติเรียบร้อย';
  let errorCode = String(payload.error_code || '');

  if ((existingLocalDuplicate || isRemoteDuplicate) && settings.rejectDuplicateSlip) {
    status = 'DUPLICATE';
    errorCode = errorCode || 'DUPLICATE_SLIP';
    verificationMessage = checks.notDuplicate.detail;
  } else if (!payload.success) {
    status = 'INVALID';
    errorCode = errorCode || 'VERIFY_FAILED';
    verificationMessage = payload.message || 'สลิปไม่ผ่านการตรวจสอบ';
  } else if (!receiverCheck.matched) {
    status = 'WRONG_ACCOUNT';
    errorCode = 'RECEIVER_MISMATCH';
    verificationMessage = receiverCheck.reason;
  } else if (!checks.validAmount.passed) {
    status = 'NEEDS_REVIEW';
    errorCode = amount <= 0 ? 'ZERO_AMOUNT' : 'BELOW_MIN_AMOUNT';
    verificationMessage = checks.validAmount.detail;
  }

  const now = getBangkokIsoNow();
  const tx = await repo.createTransaction({
    transRef,
    status,
    channel,
    amount,
    sendingBankCode: bankCode,
    sendingBankName: bankName,
    senderAccount,
    receiverAccount,
    matchedSellerAccountId: receiverCheck.account?.id ?? null,
    matchedSellerAccountLabel: receiverCheck.account
      ? `${receiverCheck.account.bankName} ${receiverCheck.account.accountNumber}`
      : '',
    transferDisplay,
    transferIso,
    recordedAt: now,
    recordedDate: getBangkokDateKey(now),
    customerName: customerName || '',
    customerLineId: customerLineId || '',
    lineSourceType: lineSourceType || '',
    lineSourceId: lineSourceId || '',
    lineMessageId: lineMessageId || '',
    category: category || 'ขายสินค้า',
    orderNote: orderNote || '',
    verificationMessage,
    errorCode,
    crcHex: String(d.crcHex || ''),
    processingMs,
    rawQrPayload: String(d.rawQrPayload || qrPayload || ''),
    tlvBreakdown,
    ocrLines,
    checks,
    rawApiResponse: payload,
  });

  return { ok: true, transportError: null, isNonSlip, transaction: tx };
}
