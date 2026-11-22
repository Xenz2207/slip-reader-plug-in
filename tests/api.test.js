import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { matchReceiverAccount } from '../server/services/verificationEngine.js';
import { verifyLineSignature, buildSlipFlexMessage } from '../server/services/lineService.js';
import { verifyFacebookSignature, buildMessengerSlipReply } from '../server/services/messengerService.js';

function signLinePayload(bodyStr, secret) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(bodyStr, 'utf8')).digest('base64');
}

function signFacebookPayload(bodyStr, appSecret) {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(Buffer.from(bodyStr, 'utf8')).digest('hex');
}

function startTestServer({ slipVerifyImpl, lineClientOverrides, messengerClientOverrides } = {}) {
  const db = createDatabase(':memory:');
  const sentReplies = [];
  const sentPushes = [];
  const sentFbMessages = [];

  const mockSlipClient = {
    async checkHealth() {
      return {
        online: true,
        httpStatus: 200,
        baseUrl: 'https://my-slip-reader.onrender.com',
        service: 'Thai Slip Reader API',
        version: '6.3.0',
        ocrEngine: 'OpenThai2.0',
        latencyMs: 42,
      };
    },
    async verifySlipImage(args) {
      if (slipVerifyImpl) return slipVerifyImpl(args);
      return {
        ok: true,
        httpStatus: 200,
        elapsedMs: 320,
        transportError: null,
        payload: {
          success: true,
          processingTimeMs: 320,
          data: {
            amount: 1500,
            crcHex: '3FF8',
            transferDisplay: '22 พ.ย. 69 14:30',
            transferIso: '2026-11-22T14:30:00+07:00',
            sendingBankCode: '004',
            sendingBankEng: 'Kasikornbank',
            senderAccount: 'xxx-x-x1111-x',
            receiverAccount: 'xxx-x-x5678-x',
            transRef: 'REF-TEST-001',
            rawQrPayload: '0042000600000101030040212REF-TEST-0015102TH91043FF8',
            tlvBreakdown: [{ tag: '00', length: 6, value: '000001', meaning: 'API ID', is_sub: true }],
            ocrExtractedLines: ['โอนเงินสำเร็จ', '1,500.00 บาท', 'นาย สมชาย ใจดี'],
          },
        },
      };
    },
  };

  const mockLineClient = {
    async downloadImageContent(messageId) {
      return {
        buffer: Buffer.from('fake-jpeg-bytes'),
        mimeType: 'image/jpeg',
        filename: `${messageId}.jpg`,
      };
    },
    async fetchProfile() {
      return 'คุณแพรวา';
    },
    async replyMessage(replyToken, messages) {
      sentReplies.push({ replyToken, messages });
      return true;
    },
    async pushMessage(to, messages) {
      sentPushes.push({ to, messages });
      return true;
    },
    async replyOrPush({ replyToken, messages }) {
      sentReplies.push({ replyToken, messages });
      return { method: 'reply' };
    },
    ...lineClientOverrides,
  };

  const mockMessengerClient = {
    async downloadAttachmentImage() {
      return {
        buffer: Buffer.from('fake-fb-jpeg'),
        mimeType: 'image/jpeg',
        filename: 'fb_slip.jpg',
      };
    },
    async fetchUserProfile() {
      return 'คุณมินท์ เฟซบุ๊ก';
    },
    async sendTextMessage(psid, text) {
      sentFbMessages.push({ psid, text });
      return true;
    },
    ...messengerClientOverrides,
  };

  const { app } = createApp({
    db,
    slipClient: mockSlipClient,
    lineClient: mockLineClient,
    messengerClient: mockMessengerClient,
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        db,
        sentReplies,
        sentPushes,
        sentFbMessages,
        close: () =>
          new Promise((done) => {
            server.close(() => {
              db.close();
              done();
            });
          }),
      });
    });
  });
}

test('matchReceiverAccount matches masked bank accounts, PromptPay, OCR name, and rejects mismatch', () => {
  const accounts = [
    {
      id: 1,
      bankCode: '004',
      bankName: 'ธนาคารกสิกรไทย',
      accountNumber: '012-3-45678-9',
      accountName: 'นาย สมชาย ใจดี',
      isActive: true,
    },
    {
      id: 2,
      bankCode: 'PROMPTPAY',
      bankName: 'พร้อมเพย์',
      accountNumber: '081-234-9988',
      accountName: 'ร้านค้าดี',
      isActive: true,
    },
  ];

  assert.equal(matchReceiverAccount('xxx-x-x5678-x', [], accounts).matched, true);
  assert.equal(matchReceiverAccount('XXX-X-X567-8', [], accounts).matched, true);
  assert.equal(matchReceiverAccount('08x-xxx-9988', [], accounts).matched, true);
  assert.equal(matchReceiverAccount('', ['โอนไปยัง นาย สมชาย ใจดี สำเร็จ'], accounts).matched, true);
  assert.equal(matchReceiverAccount('xxx-x-x0000-x', ['นาย คนอื่น'], accounts).matched, false);
});

test('verifyLineSignature validates HMAC-SHA256 properly', () => {
  const secret = 'test-channel-secret-123';
  const body = JSON.stringify({ events: [] });
  const sig = signLinePayload(body, secret);

  assert.equal(verifyLineSignature(Buffer.from(body), sig, secret), true);
  assert.equal(verifyLineSignature(Buffer.from(body + ' '), sig, secret), false);
  assert.equal(verifyLineSignature(Buffer.from(body), 'bad-sig', secret), false);
});

test('buildSlipFlexMessage constructs valid LINE Flex bubble for verified and duplicate slips', () => {
  const verifiedFlex = buildSlipFlexMessage(
    {
      status: 'VERIFIED',
      amount: 590,
      sendingBankName: 'ธนาคารกสิกรไทย',
      transferDisplay: '22 พ.ย. 69 14:00',
      receiverAccount: 'xxx-x-x5678-x',
      transRef: 'REF001',
      customerName: 'คุณลูกค้า',
    },
    { shopName: 'ร้านทดสอบ', lineReplyGreeting: 'ขอบคุณครับ' }
  );
  assert.equal(verifiedFlex.type, 'flex');
  assert.equal(verifiedFlex.contents.type, 'bubble');
  assert.equal(verifiedFlex.contents.header.backgroundColor, '#0D6B4E');

  const dupFlex = buildSlipFlexMessage(
    { status: 'DUPLICATE', amount: 590, transRef: 'REF001', verificationMessage: 'พบสลิปซ้ำ' },
    { shopName: 'ร้านทดสอบ' }
  );
  assert.equal(dupFlex.contents.header.backgroundColor, '#C82829');
});

test('End-to-end verification: revenue recording, duplicate rejection, wrong account, zero-amount review, and CSV export', async () => {
  let callIndex = 0;
  const responses = [
    // 1. Valid slip matching seller account
    {
      success: true,
      data: {
        amount: 2400,
        crcHex: 'ABCD',
        sendingBankCode: '004',
        receiverAccount: 'xxx-x-x5678-x',
        transRef: 'TX-UNIQUE-100',
        transferDisplay: '22 พ.ย. 69 14:00',
        ocrExtractedLines: ['2,400.00'],
      },
    },
    // 2. Exact duplicate transRef (even if remote API resets memory and returns success:true!)
    {
      success: true,
      data: {
        amount: 2400,
        crcHex: 'ABCD',
        sendingBankCode: '004',
        receiverAccount: 'xxx-x-x5678-x',
        transRef: 'TX-UNIQUE-100',
        transferDisplay: '22 พ.ย. 69 14:00',
      },
    },
    // 3. Wrong receiver account
    {
      success: true,
      data: {
        amount: 800,
        crcHex: '1234',
        sendingBankCode: '014',
        receiverAccount: 'xxx-x-x9999-x',
        transRef: 'TX-WRONG-200',
        transferDisplay: '22 พ.ย. 69 14:05',
      },
    },
    // 4. Amount = 0 edge case (NEEDS_REVIEW)
    {
      success: true,
      data: {
        amount: 0,
        crcHex: '5678',
        sendingBankCode: '002',
        receiverAccount: 'xxx-x-x5678-x',
        transRef: 'TX-ZERO-300',
        transferDisplay: '22 พ.ย. 69 14:10',
      },
    },
  ];

  const srv = await startTestServer({
    slipVerifyImpl: async () => ({
      ok: true,
      httpStatus: 200,
      elapsedMs: 120,
      transportError: null,
      payload: responses[callIndex++],
    }),
  });

  try {
    // Register seller receiving account
    const accRes = await fetch(`${srv.baseUrl}/api/seller-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankCode: '004',
        bankName: 'ธนาคารกสิกรไทย',
        accountNumber: '012-3-45678-9',
        accountName: 'นาย สมชาย ใจดี',
        accountType: 'BANK',
      }),
    });
    assert.equal(accRes.status, 201);

    async function uploadSlip() {
      const fd = new FormData();
      fd.append('file', new Blob(['img-bytes'], { type: 'image/jpeg' }), 'slip.jpg');
      const res = await fetch(`${srv.baseUrl}/api/verify-slip`, { method: 'POST', body: fd });
      assert.equal(res.status, 200);
      return res.json();
    }

    const r1 = await uploadSlip();
    assert.equal(r1.transaction.status, 'VERIFIED');
    assert.equal(r1.transaction.amount, 2400);

    const r2 = await uploadSlip();
    assert.equal(r2.transaction.status, 'DUPLICATE');

    const r3 = await uploadSlip();
    assert.equal(r3.transaction.status, 'WRONG_ACCOUNT');

    const r4 = await uploadSlip();
    assert.equal(r4.transaction.status, 'NEEDS_REVIEW');

    // Summary must ONLY count r1 (2400 Baht)
    const sum1 = await (await fetch(`${srv.baseUrl}/api/summary`)).json();
    assert.equal(sum1.today.revenue, 2400);
    assert.equal(sum1.today.verifiedCount, 1);
    assert.equal(sum1.today.alertCount, 3);

    // Seller reviews r4, corrects amount to 350, and approves as VERIFIED
    const patchRes = await fetch(`${srv.baseUrl}/api/transactions/${r4.transaction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VERIFIED', amount: 350, orderNote: 'แก้ยอดจาก OCR' }),
    });
    assert.equal(patchRes.status, 200);

    const sum2 = await (await fetch(`${srv.baseUrl}/api/summary`)).json();
    assert.equal(sum2.today.revenue, 2750);
    assert.equal(sum2.today.verifiedCount, 2);

    // Verify UTF-8 BOM CSV export (check raw wire bytes since fetch().text() strips BOM)
    const csvRes = await fetch(`${srv.baseUrl}/api/transactions/export.csv`);
    assert.equal(csvRes.status, 200);
    const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
    assert.deepEqual(Array.from(csvBytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
    const csvText = new TextDecoder('utf-8').decode(csvBytes);
    assert.ok(csvText.includes('TX-UNIQUE-100'));
    assert.ok(csvText.includes('แก้ยอดจาก OCR'));
  } finally {
    await srv.close();
  }
});

test('LINE Webhook verifies signature, auto-checks slip, replies with Flex Message, ignores non-slip, and answers !id', async () => {
  let mode = 'SLIP';
  const srv = await startTestServer({
    slipVerifyImpl: async () => {
      if (mode === 'NON_SLIP') {
        return {
          ok: true,
          httpStatus: 200,
          elapsedMs: 80,
          transportError: null,
          payload: {
            success: false,
            error_code: 'QR_NOT_FOUND',
            message: 'ไม่พบ QR Code ในรูปภาพนี้',
          },
        };
      }
      return {
        ok: true,
        httpStatus: 200,
        elapsedMs: 150,
        transportError: null,
        payload: {
          success: true,
          data: {
            amount: 990,
            crcHex: '99AA',
            sendingBankCode: '014',
            receiverAccount: 'xxx-x-x5678-x',
            transRef: 'LINE-REF-888',
            transferDisplay: '22 พ.ย. 69 15:00',
          },
        },
      };
    },
  });

  try {
    const secret = 'line-secret-xyz';
    srv.db.updateSettings({
      lineChannelSecret: secret,
      lineChannelAccessToken: 'line-token-abc',
      lineAutoReplyEnabled: true,
      lineIgnoreNonSlip: true,
    });

    // 1. Invalid signature rejected with 401
    const badRes = await fetch(`${srv.baseUrl}/api/line/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': 'wrong' },
      body: JSON.stringify({ events: [] }),
    });
    assert.equal(badRes.status, 401);

    // 2. Valid LINE image event -> verified + Flex reply + revenue recorded
    const imgEventBody = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'reply-token-1',
          source: { type: 'user', userId: 'U_CUST_01' },
          message: { id: 'MSG_01', type: 'image' },
        },
      ],
    });
    const okRes = await fetch(`${srv.baseUrl}/api/line/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(imgEventBody, secret),
      },
      body: imgEventBody,
    });
    assert.equal(okRes.status, 200);

    // Wait briefly for async event handler
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.sentReplies.length, 1);
    assert.equal(srv.sentReplies[0].messages[0].type, 'flex');

    const txList = await (await fetch(`${srv.baseUrl}/api/transactions`)).json();
    assert.equal(txList.items.length, 1);
    assert.equal(txList.items[0].channel, 'LINE_BOT');
    assert.equal(txList.items[0].amount, 990);
    assert.equal(txList.items[0].customerName, 'คุณแพรวา');

    // 3. Non-slip product photo should be silently ignored (no reply spam, no extra transaction)
    mode = 'NON_SLIP';
    const nonSlipBody = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'reply-token-2',
          source: { type: 'user', userId: 'U_CUST_01' },
          message: { id: 'MSG_02', type: 'image' },
        },
      ],
    });
    await fetch(`${srv.baseUrl}/api/line/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(nonSlipBody, secret),
      },
      body: nonSlipBody,
    });
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.sentReplies.length, 1); // still 1 (did not reply!)

    // 4. Text "!id" command in group returns Target ID
    const idCmdBody = JSON.stringify({
      events: [
        {
          type: 'message',
          replyToken: 'reply-token-3',
          source: { type: 'group', groupId: 'C_ADMIN_GROUP', userId: 'U_SELLER' },
          message: { id: 'MSG_03', type: 'text', text: '!id' },
        },
      ],
    });
    await fetch(`${srv.baseUrl}/api/line/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(idCmdBody, secret),
      },
      body: idCmdBody,
    });
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.sentReplies.length, 2);
    assert.ok(srv.sentReplies[1].messages[0].text.includes('C_ADMIN_GROUP'));
  } finally {
    await srv.close();
  }
});

test('Chrome Extension endpoints enforce X-API-Key and record CHROME_EXT revenue', async () => {
  const srv = await startTestServer();
  try {
    const apiKey = srv.db.getSettings().extensionApiKey;

    const unauth = await fetch(`${srv.baseUrl}/api/extension/ping`);
    assert.equal(unauth.status, 401);

    const pingRes = await fetch(`${srv.baseUrl}/api/extension/ping`, {
      headers: { 'X-API-Key': apiKey },
    });
    assert.equal(pingRes.status, 200);
    const pingData = await pingRes.json();
    assert.equal(pingData.ok, true);

    const verifyRes = await fetch(`${srv.baseUrl}/api/extension/verify-slip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        imageBase64: Buffer.from('fake-slip').toString('base64'),
        mimeType: 'image/jpeg',
        customerName: 'คุณลูกค้าแชตเว็บ',
      }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.ok, true);
    assert.equal(verifyData.transaction.channel, 'CHROME_EXT');
    assert.equal(verifyData.transaction.amount, 1500);

    // Facebook platform from Chrome Extension records FB_CHROME_EXT
    const fbExtRes = await fetch(`${srv.baseUrl}/api/extension/verify-slip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        platform: 'facebook',
        imageBase64: Buffer.from('fake-fb-slip').toString('base64'),
        mimeType: 'image/jpeg',
        customerName: 'คุณลูกค้า Inbox FB',
      }),
    });
    const fbExtData = await fbExtRes.json();
    assert.equal(fbExtData.ok, true);
    assert.equal(fbExtData.transaction.channel, 'FB_CHROME_EXT');
  } finally {
    await srv.close();
  }
});

test('Facebook Messenger Webhook verifies GET challenge, X-Hub-Signature-256, ignores echo & non-slip, verifies slip and replies', async () => {
  let mode = 'SLIP';
  const srv = await startTestServer({
    slipVerifyImpl: async () => {
      if (mode === 'NON_SLIP') {
        return {
          ok: true,
          httpStatus: 200,
          elapsedMs: 60,
          transportError: null,
          payload: {
            success: false,
            error_code: 'QR_NOT_FOUND',
            message: 'ไม่พบ QR Code ในรูปภาพ',
          },
        };
      }
      return {
        ok: true,
        httpStatus: 200,
        elapsedMs: 140,
        transportError: null,
        payload: {
          success: true,
          data: {
            amount: 1290,
            crcHex: 'BEEF',
            sendingBankCode: '004',
            receiverAccount: 'xxx-x-x5678-x',
            transRef: 'FB-REF-777',
            transferDisplay: '22 พ.ย. 69 15:10',
          },
        },
      };
    },
  });

  try {
    const appSecret = 'fb-app-secret-999';
    const verifyToken = srv.db.getSettings().fbVerifyToken;
    srv.db.updateSettings({
      fbAppSecret: appSecret,
      fbPageAccessToken: 'fb-page-token-xyz',
      fbAutoReplyEnabled: true,
      fbIgnoreNonSlip: true,
    });

    // Unit check on signature & reply builder
    assert.equal(verifyFacebookSignature(Buffer.from('hello'), signFacebookPayload('hello', appSecret), appSecret), true);
    assert.equal(verifyFacebookSignature(Buffer.from('hello'), 'sha256=deadbeef', appSecret), false);
    const sampleReply = buildMessengerSlipReply(
      { status: 'VERIFIED', amount: 1290, sendingBankName: 'ธนาคารกสิกรไทย', transRef: 'FB-REF-777' },
      { shopName: 'ร้านทดสอบ', fbReplyGreeting: 'ขอบคุณครับ' }
    );
    assert.ok(sampleReply.includes('1,290.00 บาท'));

    // 1. Meta GET verification challenge
    const badChallenge = await fetch(
      `${srv.baseUrl}/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CHAL123`
    );
    assert.equal(badChallenge.status, 403);

    const okChallenge = await fetch(
      `${srv.baseUrl}/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=CHAL123`
    );
    assert.equal(okChallenge.status, 200);
    assert.equal(await okChallenge.text(), 'CHAL123');

    // 2. Reject invalid POST signature
    const badPost = await fetch(`${srv.baseUrl}/api/messenger/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
      body: JSON.stringify({ object: 'page', entry: [] }),
    });
    assert.equal(badPost.status, 401);

    // 3. Valid Messenger image event -> verifies slip, records FB_MESSENGER revenue, replies via Send API
    const slipPayload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'PAGE_123',
          messaging: [
            {
              sender: { id: 'PSID_CUST_1' },
              recipient: { id: 'PAGE_123' },
              message: {
                mid: 'm_001',
                attachments: [{ type: 'image', payload: { url: 'https://cdn.fbsbx.com/fake-slip.jpg' } }],
              },
            },
            // Echo message from page itself must be ignored
            {
              sender: { id: 'PAGE_123' },
              recipient: { id: 'PSID_CUST_1' },
              message: {
                mid: 'm_echo',
                is_echo: true,
                attachments: [{ type: 'image', payload: { url: 'https://cdn.fbsbx.com/echo.jpg' } }],
              },
            },
          ],
        },
      ],
    });
    const okPost = await fetch(`${srv.baseUrl}/api/messenger/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signFacebookPayload(slipPayload, appSecret),
      },
      body: slipPayload,
    });
    assert.equal(okPost.status, 200);

    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.sentFbMessages.length, 1);
    assert.equal(srv.sentFbMessages[0].psid, 'PSID_CUST_1');
    assert.ok(srv.sentFbMessages[0].text.includes('1,290.00 บาท'));

    const txList = await (await fetch(`${srv.baseUrl}/api/transactions`)).json();
    assert.equal(txList.items.length, 1);
    assert.equal(txList.items[0].channel, 'FB_MESSENGER');
    assert.equal(txList.items[0].customerName, 'คุณมินท์ เฟซบุ๊ก');

    // 4. Non-slip product photo should be silently ignored
    mode = 'NON_SLIP';
    const nonSlipPayload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'PAGE_123',
          messaging: [
            {
              sender: { id: 'PSID_CUST_1' },
              message: {
                mid: 'm_002',
                attachments: [{ type: 'image', payload: { url: 'https://cdn.fbsbx.com/shirt.jpg' } }],
              },
            },
          ],
        },
      ],
    });
    await fetch(`${srv.baseUrl}/api/messenger/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signFacebookPayload(nonSlipPayload, appSecret),
      },
      body: nonSlipPayload,
    });
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.sentFbMessages.length, 1); // still 1, no spam
  } finally {
    await srv.close();
  }
});
