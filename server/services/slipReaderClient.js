import { config } from '../config.js';

export function createSlipReaderClient(defaultBaseUrl = config.slipApiBaseUrl) {
  async function checkHealth(baseUrl = defaultBaseUrl) {
    const cleanUrl = (baseUrl || defaultBaseUrl).replace(/\/+$/, '');
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

  async function verifySlipImage({
    buffer,
    filename = 'slip.jpg',
    mimeType = 'image/jpeg',
    qrPayload = '',
    source = 'api',
    baseUrl = defaultBaseUrl,
    timeoutMs = config.slipApiTimeoutMs,
  }) {
    const cleanUrl = (baseUrl || defaultBaseUrl).replace(/\/+$/, '');
    const url = `${cleanUrl}/api/verify-slip?source=${encodeURIComponent(source)}`;

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      try {
        const fd = new FormData();
        const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
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

        return {
          ok: true,
          httpStatus: res.status,
          elapsedMs,
          transportError: null,
          payload,
        };
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

  return { checkHealth, verifySlipImage };
}
