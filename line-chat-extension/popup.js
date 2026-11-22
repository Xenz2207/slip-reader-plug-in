const urlEl = document.getElementById('dashboardUrl');
const keyEl = document.getElementById('apiKey');
const autoEl = document.getElementById('autoCheck');
const badgeEl = document.getElementById('connBadge');
const statusEl = document.getElementById('statusMsg');
const summaryEl = document.getElementById('summaryCard');
const shopSubtitleEl = document.getElementById('shopSubtitle');
const todayRevEl = document.getElementById('todayRevenue');
const todayMetaEl = document.getElementById('todayMeta');

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = `status-msg ${type}`;
}

function formatBaht(n) {
  return Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function testPing(overrideConfig) {
  badgeEl.textContent = 'กำลังตรวจ...';
  badgeEl.className = 'badge badge-idle';

  chrome.runtime.sendMessage({ type: 'PING_DASHBOARD', overrideConfig }, (res) => {
    if (res?.ok && res.data) {
      badgeEl.textContent = 'เชื่อมต่อแล้ว';
      badgeEl.className = 'badge badge-ok';
      shopSubtitleEl.textContent = res.data.shopName || 'ร้านค้าของฉัน';
      todayRevEl.textContent = `${formatBaht(res.data.todayRevenue)} บาท`;
      todayMetaEl.textContent = `ผ่าน ${res.data.todayVerifiedCount} ใบ · แจ้งเตือน ${res.data.todayAlertCount} ใบ`;
      summaryEl.classList.remove('hidden');
      setStatus('เชื่อมต่อกับ Seller Dashboard สำเร็จ', 'ok');
    } else {
      badgeEl.textContent = 'ยังไม่เชื่อมต่อ';
      badgeEl.className = 'badge badge-err';
      summaryEl.classList.add('hidden');
      if (res?.error) setStatus(res.error, 'err');
    }
  });
}

chrome.storage.sync.get(['dashboardUrl', 'apiKey', 'autoCheck'], (stored) => {
  urlEl.value = stored.dashboardUrl || 'http://localhost:3001';
  keyEl.value = stored.apiKey || '';
  autoEl.checked = stored.autoCheck !== undefined ? Boolean(stored.autoCheck) : true;
  if (stored.apiKey) {
    testPing({
      dashboardUrl: urlEl.value,
      apiKey: keyEl.value,
    });
  }
});

document.getElementById('configForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const dashboardUrl = urlEl.value.trim().replace(/\/+$/, '');
  const apiKey = keyEl.value.trim();
  const autoCheck = autoEl.checked;

  chrome.storage.sync.set({ dashboardUrl, apiKey, autoCheck }, () => {
    setStatus('บันทึกค่าแล้ว กำลังทดสอบการเชื่อมต่อ...', '');
    testPing({ dashboardUrl, apiKey });
  });
});

document.getElementById('openDashboardBtn').addEventListener('click', () => {
  const target = (urlEl.value.trim() || 'http://localhost:3001').replace(/\/+$/, '');
  chrome.tabs.create({ url: target });
});
