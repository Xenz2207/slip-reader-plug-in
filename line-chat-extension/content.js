(() => {
  const PROCESSED_ATTR = 'data-slipflow-attached';
  const resultCache = new Map();
  let config = { dashboardUrl: 'http://localhost:3001', apiKey: '', autoCheck: true };
  let initialScanComplete = false;

  function loadConfig() {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (res) => {
      if (res?.ok && res.config) {
        config = res.config;
      }
    });
  }

  chrome.storage.onChanged.addListener(() => loadConfig());
  loadConfig();

  function formatBaht(amount) {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const isFacebookHost = /(facebook\.com|messenger\.com)$/i.test(window.location.hostname);
  const currentPlatform = isFacebookHost ? 'facebook' : 'line';

  function extractCustomerName() {
    const selectors = isFacebookHost
      ? [
          '[role="main"] h1',
          '[role="main"] h2 span',
          '[aria-label*="Conversation"] h2',
          '[data-testid="inbox_thread_header"] span',
          'header h2',
          'header h3',
        ]
      : [
          'header h4',
          'header h3',
          'header h2',
          '[data-testid="chat-header-name"]',
          '.chat-header .text-truncate',
          '.chat-room-header h4',
          'main header span[class*="name"]',
        ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const txt = el?.textContent?.trim();
      if (txt && txt.length >= 1 && txt.length <= 60) {
        return txt;
      }
    }
    return isFacebookHost ? 'ลูกค้าแชต Facebook' : 'ลูกค้าแชต LINE OA';
  }

  function isCandidateSlipImage(img) {
    if (!img || img.tagName !== 'IMG') return false;
    if (img.getAttribute(PROCESSED_ATTR) === '1') return false;
    const src = img.currentSrc || img.src || '';
    if (!src || src.startsWith('data:image/svg')) return false;

    const low = src.toLowerCase();
    const cls = String(img.className || '').toLowerCase();
    if (
      low.includes('sticker') ||
      low.includes('emoji') ||
      low.includes('profile.line-scdn') ||
      low.includes('avatar') ||
      cls.includes('avatar') ||
      cls.includes('sticker') ||
      cls.includes('icon')
    ) {
      return false;
    }

    const rect = img.getBoundingClientRect();
    const w = Math.max(img.naturalWidth || 0, rect.width || 0);
    const h = Math.max(img.naturalHeight || 0, rect.height || 0);
    // Payment slips in LINE chat are medium/large images, typically portrait or square (>= 140x160)
    return w >= 140 && h >= 160;
  }

  async function captureImageBase64(img) {
    const src = img.currentSrc || img.src;
    try {
      const res = await fetch(src, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return {
          imageBase64: dataUrl.replace(/^data:[^;]+;base64,/, ''),
          mimeType: blob.type || 'image/jpeg',
        };
      }
    } catch {
      // Fallback to background fetch by URL
    }
    return { imageBase64: '', mimeType: 'image/jpeg' };
  }

  function renderBadge(container, state, text, subtext = '') {
    container.innerHTML = '';
    const pill = document.createElement('div');
    pill.className = `slipflow-pill slipflow-pill--${state}`;
    const main = document.createElement('span');
    main.className = 'slipflow-pill-main';
    main.textContent = text;
    pill.appendChild(main);

    if (subtext) {
      const sub = document.createElement('span');
      sub.className = 'slipflow-pill-sub';
      sub.textContent = subtext;
      pill.appendChild(sub);
    }
    container.appendChild(pill);
  }

  async function runVerify(img, bar, isAuto) {
    const src = img.currentSrc || img.src;
    if (resultCache.has(src)) {
      const cached = resultCache.get(src);
      applyResult(bar, cached);
      return;
    }

    renderBadge(bar, 'loading', 'กำลังตรวจสลิปกับ SlipFlow...');

    const captured = await captureImageBase64(img);
    chrome.runtime.sendMessage(
      {
        type: 'VERIFY_SLIP',
        platform: currentPlatform,
        imageUrl: src,
        imageBase64: captured.imageBase64,
        mimeType: captured.mimeType,
        customerName: extractCustomerName(),
        chatRoomId: window.location.pathname,
        ignoreNonSlip: isAuto,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          renderBadge(bar, 'error', 'เชื่อมต่อปลั๊กอินไม่ได้', chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) {
          renderBadge(bar, 'error', 'ตรวจสลิปไม่สำเร็จ', response?.error || 'โปรดตั้งค่า API Key');
          return;
        }
        resultCache.set(src, response.data);
        applyResult(bar, response.data);
      }
    );
  }

  function applyResult(bar, data) {
    if (data.isNonSlip && !data.transaction) {
      renderBadge(bar, 'muted', 'ไม่ใช่สลิปโอนเงิน (ข้ามอัตโนมัติ)');
      return;
    }
    const tx = data.transaction;
    if (!tx) {
      renderBadge(bar, 'error', 'ไม่พบข้อมูลผลตรวจ');
      return;
    }

    if (tx.status === 'VERIFIED') {
      renderBadge(
        bar,
        'verified',
        `✓ ผ่าน · ${formatBaht(tx.amount)} ฿`,
        `${tx.sendingBankName || 'ธนาคาร'} · บันทึกลง Dashboard แล้ว`
      );
    } else if (tx.status === 'DUPLICATE') {
      renderBadge(bar, 'danger', '! สลิปซ้ำในระบบ', tx.verificationMessage || 'ไม่นับเป็นรายรับซ้ำ');
    } else if (tx.status === 'WRONG_ACCOUNT') {
      renderBadge(bar, 'danger', '! ผิดบัญชีร้านค้า', tx.receiverAccount || 'โปรดตรวจสอบบัญชีปลายทาง');
    } else if (tx.status === 'NEEDS_REVIEW') {
      renderBadge(bar, 'warning', '! รอตรวจยอดใน Dashboard', tx.verificationMessage || '');
    } else {
      renderBadge(bar, 'danger', '✕ ไม่ผ่านการตรวจ', tx.verificationMessage || '');
    }
  }

  function attachControlToImage(img, allowAutoCheck) {
    img.setAttribute(PROCESSED_ATTR, '1');
    const host = img.parentElement;
    if (!host) return;

    const bar = document.createElement('div');
    bar.className = 'slipflow-inline-bar';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slipflow-trigger-btn';
    btn.textContent = 'ตรวจสลิป & บันทึกรายรับ';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void runVerify(img, bar, false);
    });

    bar.appendChild(btn);
    host.insertAdjacentElement('afterend', bar);

    if (allowAutoCheck && config.autoCheck && config.apiKey) {
      void runVerify(img, bar, true);
    }
  }

  function scanDom(allowAutoCheck) {
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (isCandidateSlipImage(img)) {
        attachControlToImage(img, allowAutoCheck);
      }
    }
  }

  // Initial pass attaches manual buttons without auto-scanning historical chat backlog
  setTimeout(() => {
    scanDom(false);
    initialScanComplete = true;
  }, 1500);

  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      scanDom(initialScanComplete);
    }, 600);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
