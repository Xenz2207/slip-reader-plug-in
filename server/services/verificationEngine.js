import { resolveBankLabel, getBangkokIsoNow, getBangkokDateKey, formatBaht } from './bankMap.js';

function normalizeCompact(str) {
  return String(str || '')
    .trim()
    .replace(/[\s\-_.]/g, '')
    .toLowerCase();
}

function normalizeName(str) {
  return String(str || '')
    .replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss|บจก\.?|บริษัท|หจก\.?)\s*/gi, '')
    .replace(/[\s.\-_()]/g, '')
    .toLowerCase();
}

export function matchReceiverAccount(slipReceiverAccount, ocrLines = [], sellerAccounts = []) {
  const activeAccounts = sellerAccounts.filter((a) => a.isActive);
  if (activeAccounts.length === 0) {
    return {
      matched: true,
      skipped: true,
      account: null,
      reason: 'ยังไม่ได้ตั้งค่าบัญชีปลายทางของร้านค้า (ข้ามการตรวจบัญชีปลายทาง)',
    };
  }

  const compactSlip = normalizeCompact(slipReceiverAccount);
  const slipDigitGroups = compactSlip.match(/\d+/g) || [];
  const significantGroups = slipDigitGroups.filter((g) => g.length >= 3);
  const ocrTextJoined = normalizeName((ocrLines || []).join(' '));

  for (const acc of activeAccounts) {
    const sellerDigits = String(acc.accountNumber || '').replace(/\D/g, '');
    const sellerLabel = `${acc.bankName} (${acc.accountNumber})`;

    if (sellerDigits.length >= 4 && compactSlip) {
      // Case 1: Positional match when compact masked string has same length as seller account digits
      if (compactSlip.length === sellerDigits.length) {
        let positionalOk = true;
        let matchedDigitsCount = 0;
        for (let i = 0; i < compactSlip.length; i++) {
          const ch = compactSlip[i];
          if (ch >= '0' && ch <= '9') {
            if (ch !== sellerDigits[i]) {
              positionalOk = false;
              break;
            }
            matchedDigitsCount++;
          }
        }
        if (positionalOk && matchedDigitsCount >= 3) {
          return {
            matched: true,
            skipped: false,
            account: acc,
            reason: `ตรงกับบัญชีร้าน ${sellerLabel}`,
          };
        }
      }

      // Case 2: Ordered visible digit runs match seller digits (handles different masking styles or short 4-6 digit seller entries)
      if (significantGroups.length > 0) {
        let cursor = 0;
        let allGroupsFound = true;
        for (const group of slipDigitGroups) {
          if (group.length < 2) continue;
          const idx = sellerDigits.indexOf(group, cursor);
          if (idx === -1) {
            allGroupsFound = false;
            break;
          }
          cursor = idx + group.length;
        }
        if (allGroupsFound) {
          return {
            matched: true,
            skipped: false,
            account: acc,
            reason: `ตรงกับบัญชีร้าน ${sellerLabel}`,
          };
        }

        // Case 3: Seller entered only the last 4 digits (e.g. "5678") and slip contains those digits
        if (sellerDigits.length <= 6 && significantGroups.some((g) => g.includes(sellerDigits) || sellerDigits.includes(g))) {
          return {
            matched: true,
            skipped: false,
            account: acc,
            reason: `ตรงกับเลขท้ายบัญชีร้าน ${sellerLabel}`,
          };
        }
      }
    }

    // Case 4: Fallback receiver account name match in OCR lines (useful for PromptPay QR / wallet slips)
    const cleanSellerName = normalizeName(acc.accountName);
    if (cleanSellerName.length >= 4 && ocrTextJoined && ocrTextJoined.includes(cleanSellerName)) {
      return {
        matched: true,
        skipped: false,
        account: acc,
        reason: `ชื่อบัญชีปลายทางตรงกับ ${acc.accountName}`,
      };
    }
  }

  return {
    matched: false,
    skipped: false,
    account: null,
    reason: `บัญชีปลายทางบนสลิป (${slipReceiverAccount || 'ไม่ระบุ'}) ไม่ตรงกับบัญชีร้านที่ลงทะเบียนไว้`,
  };
}

export function detectRemoteDuplicate(apiPayload) {
  const errCode = String(apiPayload?.error_code || '').toUpperCase();
  const msg = String(apiPayload?.message || '');
  return (
    errCode.includes('DUP') ||
    msg.includes('สลิปซ้ำ') ||
    msg.includes('เคยส่งเข้าระบบแล้ว') ||
    msg.toLowerCase().includes('duplicate')
  );
}

export function detectNonSlipResponse(apiPayload) {
  if (!apiPayload || apiPayload.success) return false;
  if (detectRemoteDuplicate(apiPayload)) return false;
  const errCode = String(apiPayload?.error_code || '').toUpperCase();
  const msg = String(apiPayload?.message || '');
  return (
    errCode.includes('NO_QR') ||
    errCode.includes('QR_NOT_FOUND') ||
    errCode.includes('NOT_SLIP') ||
    errCode.includes('INVALID_IMAGE') ||
    msg.includes('ไม่พบ QR') ||
    msg.includes('ไม่พบคิวอาร์') ||
    msg.includes('ไม่ใช่สลิป') ||
    msg.toLowerCase().includes('no qr')
  );
}

export async function verifyAndRecordSlip({
  db,
  slipClient,
  hub,
  buffer,
  filename = 'slip.jpg',
  mimeType = 'image/jpeg',
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
}) {
  const settings = db.getSettings();
  const sellerAccounts = db.listSellerAccounts();

  const sourceMap = {
    LINE_BOT: 'line',
    LINE_SIMULATOR: 'line-sim',
    FB_MESSENGER: 'messenger',
    FB_SIMULATOR: 'messenger-sim',
    CHROME_EXT: 'chrome-ext',
    FB_CHROME_EXT: 'fb-chrome-ext',
    DASHBOARD: 'dashboard',
  };

  const remote = await slipClient.verifySlipImage({
    buffer,
    filename,
    mimeType,
    qrPayload,
    source: sourceMap[channel] || 'api',
    baseUrl: settings.slipApiBaseUrl,
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

  // Non-slip image handling (e.g. customer sent a product photo in LINE chat)
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

  const existingLocalDuplicate = transRef ? db.findVerifiedByTransRef(transRef) : null;
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
  const tx = db.createTransaction({
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

  hub?.broadcast('transaction:created', tx);

  return {
    ok: true,
    transportError: null,
    isNonSlip,
    transaction: tx,
  };
}
