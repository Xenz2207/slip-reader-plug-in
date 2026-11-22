import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { matchReceiverAccount } from '../server/services/verificationEngine.js';
import { verifyLineSignature, buildSlipFlexMessage } from '../server/services/lineService.js';
import { verifyFacebookSignature, buildMessengerSlipReply } from '../server/services/messengerService.js';
import { verifyLineSignatureWeb, verifyFacebookSignatureWeb } from '../worker/crypto.js';

function signLinePayload(bodyStr, secret) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(bodyStr, 'utf8')).digest('base64');
}

function signFacebookPayload(bodyStr, appSecret) {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(Buffer.from(bodyStr, 'utf8')).digest('hex');
}

function startTestServer({ slipVerifyImpl, lineClientOverrides, messengerClientOverrides } = {}) {
  const sentReplies = [];
  const sentPushes = [];
  const sentFbMessages = [];

  const mockSlipClient = {
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

  const { app, db, repo } = createApp({
    dbPath: ':memory:',
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
        repo,
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

async function registerShopAccount(baseUrl, { username, password = 'password123', shopName }) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, shopName }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  return {
    token: data.token,
    user: data.user,
    shop: data.shops[0],
    headers(extra = {}) {
      return {
        Authorization: `Bearer ${data.token}`,
        'X-Shop-Id': String(data.shops[0].id),
        ...extra,
      };
    },
  };
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

test('verifyLineSignature and Cloudflare Worker Web Crypto HMAC verify LINE and Facebook signatures', async () => {
  const secret = 'cf-worker-secret-456';
  const bodyStr = JSON.stringify({ events: [{ type: 'message' }] });
  const rawBuf = new TextEncoder().encode(bodyStr).buffer;

  const lineSig = signLinePayload(bodyStr, secret);
  assert.equal(verifyLineSignature(Buffer.from(bodyStr), lineSig, secret), true);
  assert.equal(await verifyLineSignatureWeb(rawBuf, lineSig, secret), true);
  assert.equal(await verifyLineSignatureWeb(rawBuf, 'invalid', secret), false);

  const fbSig = signFacebookPayload(bodyStr, secret);
  assert.equal(verifyFacebookSignature(Buffer.from(bodyStr), fbSig, secret), true);
  assert.equal(await verifyFacebookSignatureWeb(rawBuf, fbSig, secret), true);
  assert.equal(await verifyFacebookSignatureWeb(rawBuf, 'sha256=bad', secret), false);
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

test('Multi-Shop Auth & Strict Tenant Isolation: two shops never mix transactions, settings, or webhooks', async () => {
  const srv = await startTestServer();
  try {
    // Unauthenticated call rejected with 401
    const unauth = await fetch(`${srv.baseUrl}/api/summary`);
    assert.equal(unauth.status, 401);

    // Register Shop A (1st user -> auto-promoted to ADMIN) and Shop B (2nd user -> SELLER)
    const shopA = await registerShopAccount(srv.baseUrl, {
      username: 'seller_a',
      shopName: 'ร้านเสื้อผ้า A',
    });
    const shopB = await registerShopAccount(srv.baseUrl, {
      username: 'seller_b',
      shopName: 'ร้านคาเฟ่ B',
    });

    assert.equal(shopA.user.role, 'ADMIN');
    assert.equal(shopB.user.role, 'SELLER');
    assert.notEqual(shopA.shop.id, shopB.shop.id);
    assert.notEqual(shopA.shop.webhookSlug, shopB.shop.webhookSlug);

    // Normal SELLER (Shop B) cannot access Shop A's data by spoofing X-Shop-Id
    const crossAccess = await fetch(`${srv.baseUrl}/api/summary`, {
      headers: {
        Authorization: `Bearer ${shopB.token}`,
        'X-Shop-Id': String(shopA.shop.id),
      },
    });
    assert.equal(crossAccess.status, 403);

    // Normal SELLER (Shop B) cannot access /api/admin/overview
    const nonAdminOverview = await fetch(`${srv.baseUrl}/api/admin/overview`, {
      headers: shopB.headers(),
    });
    assert.equal(nonAdminOverview.status, 403);

    // Record manual revenue in Shop A (1,000 Baht) and Shop B (450 Baht)
    await fetch(`${srv.baseUrl}/api/transactions/manual`, {
      method: 'POST',
      headers: shopA.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ amount: 1000, customerName: 'ลูกค้า A' }),
    });
    await fetch(`${srv.baseUrl}/api/transactions/manual`, {
      method: 'POST',
      headers: shopB.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ amount: 450, customerName: 'ลูกค้า B' }),
    });

    const sumA = await (await fetch(`${srv.baseUrl}/api/summary`, { headers: shopA.headers() })).json();
    const sumB = await (await fetch(`${srv.baseUrl}/api/summary`, { headers: shopB.headers() })).json();
    assert.equal(sumA.today.revenue, 1000);
    assert.equal(sumB.today.revenue, 450);

    // Super Admin (Shop A) can view Platform Overview across all shops (1000 + 450 = 1450 Baht)
    const adminOverviewRes = await fetch(`${srv.baseUrl}/api/admin/overview`, {
      headers: shopA.headers(),
    });
    assert.equal(adminOverviewRes.status, 200);
    const adminOverview = await adminOverviewRes.json();
    assert.equal(adminOverview.kpis.totalShops, 2);
    assert.equal(adminOverview.kpis.todayRevenue, 1450);

    // Super Admin can also inspect Shop B's dashboard directly via X-Shop-Id
    const adminInspectB = await fetch(`${srv.baseUrl}/api/summary`, {
      headers: {
        Authorization: `Bearer ${shopA.token}`,
        'X-Shop-Id': String(shopB.shop.id),
      },
    });
    assert.equal(adminInspectB.status, 200);
    const adminInspectBData = await adminInspectB.json();
    assert.equal(adminInspectBData.today.revenue, 450);

    // Super Admin can create a new seller user + shop, and reset password
    const createByAdmin = await fetch(`${srv.baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: shopA.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        username: 'seller_c',
        password: 'initpass123',
        shopName: 'ร้านขนม C',
        role: 'SELLER',
      }),
    });
    assert.equal(createByAdmin.status, 201);
    const createdC = await createByAdmin.json();

    const resetRes = await fetch(`${srv.baseUrl}/api/admin/users/${createdC.user.id}`, {
      method: 'PATCH',
      headers: shopA.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ newPassword: 'newpassword999' }),
    });
    assert.equal(resetRes.status, 200);

    const loginNewPass = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'seller_c', password: 'newpassword999' }),
    });
    assert.equal(loginNewPass.status, 200);

    // Set different LINE secrets for Shop A and Shop B
    await fetch(`${srv.baseUrl}/api/settings`, {
      method: 'PUT',
      headers: shopA.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ lineChannelSecret: 'secret-shop-a', lineChannelAccessToken: 'tok-a' }),
    });
    await fetch(`${srv.baseUrl}/api/settings`, {
      method: 'PUT',
      headers: shopB.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ lineChannelSecret: 'secret-shop-b', lineChannelAccessToken: 'tok-b' }),
    });

    // Sending Shop A's signature to Shop B's webhook slug must fail with 401
    const eventBody = JSON.stringify({ events: [] });
    const wrongSlugRes = await fetch(
      `${srv.baseUrl}/api/line/webhook/${shopB.shop.webhookSlug}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': signLinePayload(eventBody, 'secret-shop-a'),
        },
        body: eventBody,
      }
    );
    assert.equal(wrongSlugRes.status, 401);
  } finally {
    await srv.close();
  }
});

test('End-to-end verification: revenue recording, duplicate rejection, wrong account, zero-amount review, and CSV export', async () => {
  let callIndex = 0;
  const responses = [
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
    const auth = await registerShopAccount(srv.baseUrl, {
      username: 'main_shop',
      shopName: 'ร้านหลัก',
    });

    const accRes = await fetch(`${srv.baseUrl}/api/seller-accounts`, {
      method: 'POST',
      headers: auth.headers({ 'Content-Type': 'application/json' }),
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
      const res = await fetch(`${srv.baseUrl}/api/verify-slip`, {
        method: 'POST',
        headers: auth.headers(),
        body: fd,
      });
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

    const sum1 = await (await fetch(`${srv.baseUrl}/api/summary`, { headers: auth.headers() })).json();
    assert.equal(sum1.today.revenue, 2400);
    assert.equal(sum1.today.verifiedCount, 1);
    assert.equal(sum1.today.alertCount, 3);

    const patchRes = await fetch(`${srv.baseUrl}/api/transactions/${r4.transaction.id}`, {
      method: 'PATCH',
      headers: auth.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'VERIFIED', amount: 350, orderNote: 'แก้ยอดจาก OCR' }),
    });
    assert.equal(patchRes.status, 200);

    const sum2 = await (await fetch(`${srv.baseUrl}/api/summary`, { headers: auth.headers() })).json();
    assert.equal(sum2.today.revenue, 2750);
    assert.equal(sum2.today.verifiedCount, 2);

    const csvRes = await fetch(
      `${srv.baseUrl}/api/transactions/export.csv?token=${encodeURIComponent(auth.token)}&shopId=${auth.shop.id}`
    );
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

test('Per-shop LINE Webhook verifies signature, auto-checks slip, replies with Flex Message, ignores non-slip, and answers !id', async () => {
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
    const auth = await registerShopAccount(srv.baseUrl, {
      username: 'line_seller',
      shopName: 'ร้านทดสอบ LINE',
    });
    const secret = 'line-secret-xyz';
    await srv.repo.updateSettings(auth.shop.id, {
      lineChannelSecret: secret,
      lineChannelAccessToken: 'line-token-abc',
      lineAutoReplyEnabled: true,
      lineIgnoreNonSlip: true,
    });

    const webhookUrl = `${srv.baseUrl}/api/line/webhook/${auth.shop.webhookSlug}`;

    const badRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-line-signature': 'wrong' },
      body: JSON.stringify({ events: [] }),
    });
    assert.equal(badRes.status, 401);

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
    const okRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(imgEventBody, secret),
      },
      body: imgEventBody,
    });
    assert.equal(okRes.status, 200);

    assert.equal(srv.sentReplies.length, 1);
    assert.equal(srv.sentReplies[0].messages[0].type, 'flex');

    const txList = await (
      await fetch(`${srv.baseUrl}/api/transactions`, { headers: auth.headers() })
    ).json();
    assert.equal(txList.items.length, 1);
    assert.equal(txList.items[0].channel, 'LINE_BOT');
    assert.equal(txList.items[0].amount, 990);

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
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(nonSlipBody, secret),
      },
      body: nonSlipBody,
    });
    assert.equal(srv.sentReplies.length, 1);

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
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signLinePayload(idCmdBody, secret),
      },
      body: idCmdBody,
    });
    assert.equal(srv.sentReplies.length, 2);
    assert.ok(srv.sentReplies[1].messages[0].text.includes('C_ADMIN_GROUP'));
  } finally {
    await srv.close();
  }
});

test('Chrome Extension endpoints resolve shop by X-API-Key and record isolated revenue', async () => {
  const srv = await startTestServer();
  try {
    const shopA = await registerShopAccount(srv.baseUrl, {
      username: 'ext_shop_a',
      shopName: 'ร้าน Extension A',
    });
    const settingsA = await srv.repo.getSettings(shopA.shop.id);
    const apiKeyA = settingsA.extensionApiKey;

    const unauth = await fetch(`${srv.baseUrl}/api/extension/ping`);
    assert.equal(unauth.status, 401);

    const pingRes = await fetch(`${srv.baseUrl}/api/extension/ping`, {
      headers: { 'X-API-Key': apiKeyA },
    });
    assert.equal(pingRes.status, 200);
    const pingData = await pingRes.json();
    assert.equal(pingData.shopId, shopA.shop.id);

    const fbExtRes = await fetch(`${srv.baseUrl}/api/extension/verify-slip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKeyA,
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
    assert.equal(fbExtData.transaction.shopId, shopA.shop.id);
  } finally {
    await srv.close();
  }
});

test('Per-shop Facebook Messenger Webhook verifies GET challenge, X-Hub-Signature-256, ignores echo & non-slip, verifies slip and replies', async () => {
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
    const auth = await registerShopAccount(srv.baseUrl, {
      username: 'fb_seller',
      shopName: 'ร้านทดสอบ FB',
    });
    const appSecret = 'fb-app-secret-999';
    const settings = await srv.repo.getSettings(auth.shop.id);
    const verifyToken = settings.fbVerifyToken;

    await srv.repo.updateSettings(auth.shop.id, {
      fbAppSecret: appSecret,
      fbPageAccessToken: 'fb-page-token-xyz',
      fbAutoReplyEnabled: true,
      fbIgnoreNonSlip: true,
    });

    const webhookUrl = `${srv.baseUrl}/api/messenger/webhook/${auth.shop.webhookSlug}`;

    const sampleReply = buildMessengerSlipReply(
      { status: 'VERIFIED', amount: 1290, sendingBankName: 'ธนาคารกสิกรไทย', transRef: 'FB-REF-777' },
      { shopName: 'ร้านทดสอบ', fbReplyGreeting: 'ขอบคุณครับ' }
    );
    assert.ok(sampleReply.includes('1,290.00 บาท'));

    const badChallenge = await fetch(
      `${webhookUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CHAL123`
    );
    assert.equal(badChallenge.status, 403);

    const okChallenge = await fetch(
      `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=CHAL123`
    );
    assert.equal(okChallenge.status, 200);
    assert.equal(await okChallenge.text(), 'CHAL123');

    const badPost = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
      body: JSON.stringify({ object: 'page', entry: [] }),
    });
    assert.equal(badPost.status, 401);

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
    const okPost = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signFacebookPayload(slipPayload, appSecret),
      },
      body: slipPayload,
    });
    assert.equal(okPost.status, 200);

    assert.equal(srv.sentFbMessages.length, 1);
    assert.equal(srv.sentFbMessages[0].psid, 'PSID_CUST_1');
    assert.ok(srv.sentFbMessages[0].text.includes('1,290.00 บาท'));

    const txList = await (
      await fetch(`${srv.baseUrl}/api/transactions`, { headers: auth.headers() })
    ).json();
    assert.equal(txList.items.length, 1);
    assert.equal(txList.items[0].channel, 'FB_MESSENGER');
    assert.equal(txList.items[0].shopId, auth.shop.id);
  } finally {
    await srv.close();
  }
});
