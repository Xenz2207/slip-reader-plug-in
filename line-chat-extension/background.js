const DEFAULT_CONFIG = {
  dashboardUrl: 'http://localhost:3001',
  apiKey: '',
  autoCheck: true,
};

async function getConfig() {
  const stored = await chrome.storage.sync.get(['dashboardUrl', 'apiKey', 'autoCheck']);
  return {
    dashboardUrl: (stored.dashboardUrl || DEFAULT_CONFIG.dashboardUrl).replace(/\/+$/, ''),
    apiKey: (stored.apiKey || '').trim(),
    autoCheck: stored.autoCheck !== undefined ? Boolean(stored.autoCheck) : DEFAULT_CONFIG.autoCheck,
  };
}

async function fetchImageAsBase64(imageUrl) {
  const res = await fetch(imageUrl, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`ดึงรูปภาพไม่สำเร็จ (HTTP ${res.status})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return {
    imageBase64: btoa(binary),
    mimeType,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_CONFIG') {
    getConfig().then((cfg) => sendResponse({ ok: true, config: cfg }));
    return true;
  }

  if (message?.type === 'PING_DASHBOARD') {
    (async () => {
      try {
        const cfg = message.overrideConfig || (await getConfig());
        const base = (cfg.dashboardUrl || '').replace(/\/+$/, '');
        if (!base || !cfg.apiKey) {
          return sendResponse({ ok: false, error: 'กรุณากรอก Dashboard URL และ API Key' });
        }
        const res = await fetch(`${base}/api/extension/ping`, {
          method: 'GET',
          headers: { 'X-API-Key': cfg.apiKey },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
        }
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'เชื่อมต่อ Dashboard ไม่ได้' });
      }
    })();
    return true;
  }

  if (message?.type === 'VERIFY_SLIP') {
    (async () => {
      try {
        const cfg = await getConfig();
        if (!cfg.dashboardUrl || !cfg.apiKey) {
          return sendResponse({
            ok: false,
            error: 'ยังไม่ได้ตั้งค่า API Key ในปลั๊กอิน SlipFlow',
          });
        }

        let imageBase64 = message.imageBase64 || '';
        let mimeType = message.mimeType || 'image/jpeg';

        if (!imageBase64 && message.imageUrl) {
          const downloaded = await fetchImageAsBase64(message.imageUrl);
          imageBase64 = downloaded.imageBase64;
          mimeType = downloaded.mimeType;
        }

        if (!imageBase64) {
          return sendResponse({ ok: false, error: 'ไม่สามารถอ่านไฟล์รูปภาพจากหน้าแชตได้' });
        }

        const res = await fetch(`${cfg.dashboardUrl}/api/extension/verify-slip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': cfg.apiKey,
          },
          body: JSON.stringify({
            imageBase64,
            mimeType,
            filename: message.platform === 'facebook' ? 'fb-chat-slip.jpg' : 'line-oa-chat-slip.jpg',
            platform: message.platform || 'line',
            customerName:
              message.customerName ||
              (message.platform === 'facebook' ? 'ลูกค้าแชต Facebook' : 'ลูกค้าแชต LINE OA'),
            chatRoomId: message.chatRoomId || '',
            ignoreNonSlip: Boolean(message.ignoreNonSlip),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return sendResponse({ ok: false, error: data.error || `ตรวจสอบไม่สำเร็จ (HTTP ${res.status})` });
        }
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'เกิดข้อผิดพลาดระหว่างส่งตรวจสลิป' });
      }
    })();
    return true;
  }

  return false;
});
