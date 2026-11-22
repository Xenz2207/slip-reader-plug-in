import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  Send,
  UploadCloud,
  Loader2,
  Chrome,
  Bot,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
} from 'lucide-react';
import type { PublicSettings, Transaction, WebhookLog } from '../types';
import { api } from '../lib/api';
import { formatRecordedTime, preScanQrFromFile } from '../lib/format';
import { FlexPreviewCard } from '../components/FlexPreviewCard';
import { MessengerPreviewCard } from '../components/MessengerPreviewCard';

interface LinePluginPageProps {
  settings: PublicSettings | null;
  webhookLogs: WebhookLog[];
  onSettingsUpdated: (s: PublicSettings) => void;
  onRefreshLogs: () => void;
  onSimulated: (tx: Transaction) => void;
  onInspectTransaction: (tx: Transaction) => void;
}

export function LinePluginPage({
  settings,
  webhookLogs,
  onSettingsUpdated,
  onRefreshLogs,
  onSimulated,
  onInspectTransaction,
}: LinePluginPageProps) {
  const [pluginTab, setPluginTab] = useState<'line' | 'messenger' | 'extension'>('line');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // LINE OA Bot form state
  const [channelSecret, setChannelSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [adminTargetId, setAdminTargetId] = useState('');
  const [autoReply, setAutoReply] = useState(true);
  const [replyOnError, setReplyOnError] = useState(true);
  const [ignoreNonSlip, setIgnoreNonSlip] = useState(true);
  const [notifyAdminVerified, setNotifyAdminVerified] = useState(false);
  const [notifyAdminAlert, setNotifyAdminAlert] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [savingLine, setSavingLine] = useState(false);
  const [lineFeedback, setLineFeedback] = useState('');
  const [pushTesting, setPushTesting] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // LINE Simulator state
  const simFileRef = useRef<HTMLInputElement | null>(null);
  const [simFile, setSimFile] = useState<File | null>(null);
  const [simQr, setSimQr] = useState('');
  const [simCustomer, setSimCustomer] = useState('คุณแพรวา (ทดสอบ LINE)');
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState('');
  const [simTx, setSimTx] = useState<Transaction | null>(null);

  // Facebook Messenger form state
  const [fbAppSecret, setFbAppSecret] = useState('');
  const [fbPageToken, setFbPageToken] = useState('');
  const [fbAutoReply, setFbAutoReply] = useState(true);
  const [fbReplyOnError, setFbReplyOnError] = useState(true);
  const [fbIgnoreNonSlip, setFbIgnoreNonSlip] = useState(true);
  const [fbNotifyLineAdmin, setFbNotifyLineAdmin] = useState(false);
  const [fbGreeting, setFbGreeting] = useState('');
  const [savingFb, setSavingFb] = useState(false);
  const [fbFeedback, setFbFeedback] = useState('');
  const [regenFbTokenLoading, setRegenFbTokenLoading] = useState(false);

  // Facebook Messenger Simulator state
  const fbSimFileRef = useRef<HTMLInputElement | null>(null);
  const [fbSimFile, setFbSimFile] = useState<File | null>(null);
  const [fbSimQr, setFbSimQr] = useState('');
  const [fbSimCustomer, setFbSimCustomer] = useState('คุณมินท์ (ทดสอบ Facebook)');
  const [fbSimLoading, setFbSimLoading] = useState(false);
  const [fbSimError, setFbSimError] = useState('');
  const [fbSimTx, setFbSimTx] = useState<Transaction | null>(null);
  const [fbSimReplyText, setFbSimReplyText] = useState('');

  const [regenLoading, setRegenLoading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setAdminTargetId(settings.lineAdminNotifyTargetId || '');
    setAutoReply(settings.lineAutoReplyEnabled);
    setReplyOnError(settings.lineReplyOnError);
    setIgnoreNonSlip(settings.lineIgnoreNonSlip);
    setNotifyAdminVerified(settings.lineNotifyAdminOnVerified);
    setNotifyAdminAlert(settings.lineNotifyAdminOnAlert);
    setGreeting(settings.lineReplyGreeting || '');

    setFbAutoReply(settings.fbAutoReplyEnabled);
    setFbReplyOnError(settings.fbReplyOnError);
    setFbIgnoreNonSlip(settings.fbIgnoreNonSlip);
    setFbNotifyLineAdmin(settings.fbNotifyLineAdmin);
    setFbGreeting(settings.fbReplyGreeting || '');
  }, [settings]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const lineWebhookUrl = `${origin}/api/line/webhook`;
  const fbWebhookUrl = `${origin}/api/messenger/webhook`;

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  }

  async function handleSaveBotSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingLine(true);
    setLineFeedback('');
    try {
      const payload: Record<string, unknown> = {
        lineAdminNotifyTargetId: adminTargetId.trim(),
        lineAutoReplyEnabled: autoReply,
        lineReplyOnError: replyOnError,
        lineIgnoreNonSlip: ignoreNonSlip,
        lineNotifyAdminOnVerified: notifyAdminVerified,
        lineNotifyAdminOnAlert: notifyAdminAlert,
        lineReplyGreeting: greeting.trim(),
      };
      if (channelSecret.trim()) payload.lineChannelSecret = channelSecret.trim();
      if (accessToken.trim()) payload.lineChannelAccessToken = accessToken.trim();

      const res = await api.updateSettings(payload);
      onSettingsUpdated(res.settings);
      setChannelSecret('');
      setAccessToken('');
      setLineFeedback('บันทึกการตั้งค่า LINE OA Bot เรียบร้อยแล้ว');
      setTimeout(() => setLineFeedback(''), 3000);
    } catch (err) {
      setLineFeedback(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingLine(false);
    }
  }

  async function handleSaveFbSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingFb(true);
    setFbFeedback('');
    try {
      const payload: Record<string, unknown> = {
        fbAutoReplyEnabled: fbAutoReply,
        fbReplyOnError: fbReplyOnError,
        fbIgnoreNonSlip: fbIgnoreNonSlip,
        fbNotifyLineAdmin: fbNotifyLineAdmin,
        fbReplyGreeting: fbGreeting.trim(),
      };
      if (fbAppSecret.trim()) payload.fbAppSecret = fbAppSecret.trim();
      if (fbPageToken.trim()) payload.fbPageAccessToken = fbPageToken.trim();

      const res = await api.updateSettings(payload);
      onSettingsUpdated(res.settings);
      setFbAppSecret('');
      setFbPageToken('');
      setFbFeedback('บันทึกการตั้งค่า Facebook Messenger เรียบร้อยแล้ว');
      setTimeout(() => setFbFeedback(''), 3000);
    } catch (err) {
      setFbFeedback(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingFb(false);
    }
  }

  async function handleTestPush() {
    setPushTesting(true);
    setPushFeedback(null);
    try {
      const res = await api.testLinePush();
      setPushFeedback({ ok: true, msg: res.message });
    } catch (err) {
      setPushFeedback({ ok: false, msg: err instanceof Error ? err.message : 'ส่งทดสอบไม่สำเร็จ' });
    } finally {
      setPushTesting(false);
    }
  }

  async function handlePickSimFile(f: File | null) {
    setSimFile(f);
    setSimQr('');
    setSimError('');
    if (!f) return;
    const qr = await preScanQrFromFile(f);
    if (qr) setSimQr(qr);
  }

  async function handleSimulateLine(e: React.FormEvent) {
    e.preventDefault();
    if (!simFile) return;
    setSimLoading(true);
    setSimError('');
    try {
      const fd = new FormData();
      fd.append('file', simFile);
      if (simQr) fd.append('qr_payload', simQr);
      fd.append('customerName', simCustomer);
      const res = await api.simulateLineSlip(fd);
      setSimTx(res.transaction);
      if (res.transaction) onSimulated(res.transaction);
      onRefreshLogs();
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'จำลองการตรวจสลิปไม่สำเร็จ');
    } finally {
      setSimLoading(false);
    }
  }

  async function handlePickFbSimFile(f: File | null) {
    setFbSimFile(f);
    setFbSimQr('');
    setFbSimError('');
    if (!f) return;
    const qr = await preScanQrFromFile(f);
    if (qr) setFbSimQr(qr);
  }

  async function handleSimulateFb(e: React.FormEvent) {
    e.preventDefault();
    if (!fbSimFile) return;
    setFbSimLoading(true);
    setFbSimError('');
    try {
      const fd = new FormData();
      fd.append('file', fbSimFile);
      if (fbSimQr) fd.append('qr_payload', fbSimQr);
      fd.append('customerName', fbSimCustomer);
      const res = await api.simulateMessengerSlip(fd);
      setFbSimTx(res.transaction);
      setFbSimReplyText(res.replyText || '');
      if (res.transaction) onSimulated(res.transaction);
      onRefreshLogs();
    } catch (err) {
      setFbSimError(err instanceof Error ? err.message : 'จำลองการตรวจสลิปไม่สำเร็จ');
    } finally {
      setFbSimLoading(false);
    }
  }

  async function handleRegenerateKey() {
    if (!window.confirm('สร้าง API Key ใหม่ใช่ไหม? คุณจะต้องนำคีย์ใหม่ไปวางใน Chrome Extension ด้วย')) {
      return;
    }
    setRegenLoading(true);
    try {
      const res = await api.regenerateExtensionApiKey();
      if (settings) {
        onSettingsUpdated({ ...settings, extensionApiKey: res.extensionApiKey });
      }
    } finally {
      setRegenLoading(false);
    }
  }

  async function handleRegenerateFbToken() {
    if (!window.confirm('สร้าง Verify Token ใหม่ใช่ไหม? คุณจะต้องนำไปวางใหม่ใน Meta Developers Console ด้วย')) {
      return;
    }
    setRegenFbTokenLoading(true);
    try {
      const res = await api.regenerateFbVerifyToken();
      if (settings) {
        onSettingsUpdated({ ...settings, fbVerifyToken: res.fbVerifyToken });
      }
    } finally {
      setRegenFbTokenLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#10201A]">ปลั๊กอินแชต (LINE OA &amp; Facebook Messenger)</h1>
          <p className="text-[13.5px] text-[#52645D] mt-0.5">
            เช็กสลิปอัตโนมัติและลงบัญชีรายรับได้ทั้งบนมือถือ 24 ชม. (ผ่าน Webhook Bot) และบนเบราว์เซอร์ (Chrome Extension)
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="inline-flex flex-wrap rounded-[12px] bg-[#E8ECEA] p-1 gap-0.5">
          <button
            type="button"
            onClick={() => setPluginTab('line')}
            className={`btn-press px-3.5 py-2 rounded-[8px] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              pluginTab === 'line' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
            }`}
          >
            <Bot className="w-4 h-4 text-[#06C755]" />
            LINE OA Bot
          </button>
          <button
            type="button"
            onClick={() => setPluginTab('messenger')}
            className={`btn-press px-3.5 py-2 rounded-[8px] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              pluginTab === 'messenger' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
            }`}
          >
            <MessageCircle className="w-4 h-4 text-[#0084FF]" />
            Facebook Messenger
          </button>
          <button
            type="button"
            onClick={() => setPluginTab('extension')}
            className={`btn-press px-3.5 py-2 rounded-[8px] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              pluginTab === 'extension' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
            }`}
          >
            <Chrome className="w-4 h-4 text-[#0D6B4E]" />
            Chrome Extension
          </button>
        </div>
      </div>

      {/* TAB 1: LINE OA WEBHOOK BOT */}
      {pluginTab === 'line' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 space-y-5">
            <section className="ledger-surface rounded-[16px] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold text-[#10201A]">1. Webhook URL สำหรับ LINE Developers</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                    settings?.hasLineChannelSecret && settings?.hasLineChannelAccessToken
                      ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                      : 'bg-[#FEF4E6] text-[#B45309]'
                  }`}
                >
                  {settings?.hasLineChannelSecret && settings?.hasLineChannelAccessToken
                    ? 'ตั้งค่า Token แล้ว'
                    : 'รอใส่ Channel Secret / Token'}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-[10px] bg-[#F4F6F5] border border-[#E3E8E5] p-2.5">
                <span className="px-2 py-0.5 rounded-[6px] bg-[#06C755] text-white font-mono-code text-[11.5px] font-semibold shrink-0">
                  POST
                </span>
                <code className="font-mono-code text-[12.5px] text-[#10201A] truncate flex-1">
                  {lineWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copyText('line-webhook', lineWebhookUrl)}
                  className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedId === 'line-webhook' ? (
                    <Check className="w-3.5 h-3.5 text-[#0D6B4E]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedId === 'line-webhook' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                </button>
              </div>

              <ol className="text-[13px] text-[#42544D] space-y-1.5 list-decimal pl-5">
                <li>เปิด LINE Developers Console &gt; เลือก Messaging API Channel ของร้านค้า</li>
                <li>วาง Webhook URL (แบบ HTTPS เมื่อ Deploy ออนไลน์) แล้วเปิด <strong>Use webhook</strong></li>
                <li>ใน LINE OA Manager ตั้งโหมดเป็น <strong>แชต + Webhook เปิด</strong> เพื่อให้ตอบแชตบนมือถือได้พร้อมบอท</li>
                <li>หากต้องการแจ้งเตือนเข้ากลุ่มแอดมิน เชิญบอทเข้ากลุ่มแล้วพิมพ์ <code className="font-mono-code bg-[#F4F6F5] px-1.5 py-0.5 rounded">!id</code></li>
              </ol>
            </section>

            <form onSubmit={handleSaveBotSettings} className="ledger-surface rounded-[16px] p-5 space-y-4">
              <h2 className="text-[16px] font-semibold text-[#10201A]">2. เชื่อมต่อ LINE Messaging API และกฎตอบกลับ</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    Channel Secret {settings?.hasLineChannelSecret ? `(${settings.lineChannelSecretMasked})` : ''}
                  </label>
                  <input
                    type="password"
                    value={channelSecret}
                    onChange={(e) => setChannelSecret(e.target.value)}
                    placeholder={settings?.hasLineChannelSecret ? 'กรอกใหม่เมื่อต้องการเปลี่ยน' : 'วาง Channel Secret'}
                    className="input-field font-mono-code !text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    Channel Access Token {settings?.hasLineChannelAccessToken ? '(บันทึกแล้ว)' : ''}
                  </label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={settings?.hasLineChannelAccessToken ? 'กรอกใหม่เมื่อต้องการเปลี่ยน' : 'วาง Channel Access Token'}
                    className="input-field font-mono-code !text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  Admin Group / User Target ID (แจ้งเตือนหลังบ้าน — ไม่บังคับ)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminTargetId}
                    onChange={(e) => setAdminTargetId(e.target.value)}
                    placeholder="เช่น C1234567890abcdef..."
                    className="input-field font-mono-code !text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={handleTestPush}
                    disabled={pushTesting}
                    className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {pushTesting ? 'กำลังส่ง...' : 'ทดสอบ Push'}
                  </button>
                </div>
                {pushFeedback && (
                  <p className={`mt-1.5 text-[12.5px] ${pushFeedback.ok ? 'text-[#0D6B4E]' : 'text-[#C82829]'}`}>
                    {pushFeedback.msg}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  ข้อความท้ายใบยืนยัน Flex Message (เมื่อตรวจผ่าน)
                </label>
                <input
                  type="text"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-[#EEF2F0]">
                {[
                  {
                    checked: autoReply,
                    onChange: setAutoReply,
                    title: 'ตอบกลับลูกค้าในแชต LINE ด้วย Flex Message อัตโนมัติ',
                    desc: 'แสดงการ์ดยืนยันยอดเงิน ธนาคาร และเลขอ้างอิงทันทีหลังตรวจผ่าน',
                  },
                  {
                    checked: replyOnError,
                    onChange: setReplyOnError,
                    title: 'แจ้งกลับในแชตเมื่อสลิปซ้ำ หรือโอนผิดบัญชีร้าน',
                    desc: 'แจ้งเตือนทันทีหากส่งสลิปซ้ำหรือบัญชีปลายทางไม่ตรง',
                  },
                  {
                    checked: ignoreNonSlip,
                    onChange: setIgnoreNonSlip,
                    title: 'ข้ามรูปภาพทั่วไปที่ไม่ใช่สลิป (แนะนำ)',
                    desc: 'เมื่อลูกค้าส่งรูปสินค้า บอทจะไม่ตอบข้อความแจ้งเตือนรบกวน',
                  },
                  {
                    checked: notifyAdminAlert,
                    onChange: setNotifyAdminAlert,
                    title: 'ส่ง Push แจ้งเตือนกลุ่มแอดมินเมื่อพบสลิปซ้ำ / ผิดบัญชี / ยอด 0',
                    desc: 'ต้องระบุ Admin Target ID ด้านบน',
                  },
                  {
                    checked: notifyAdminVerified,
                    onChange: setNotifyAdminVerified,
                    title: 'ส่ง Push แจ้งเตือนกลุ่มแอดมินทุกครั้งที่มีสลิปผ่าน',
                    desc: 'เหมาะสำหรับทีมแพ็กของที่ต้องการเห็นยอดเข้าทันที',
                  },
                ].map((opt) => (
                  <label
                    key={opt.title}
                    className="flex items-start gap-3 p-2 rounded-[10px] hover:bg-[#F8FAF9] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => opt.onChange(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[#0D6B4E] rounded cursor-pointer"
                    />
                    <div>
                      <div className="text-[13.5px] font-medium text-[#10201A]">{opt.title}</div>
                      <div className="text-[12px] text-[#64756E]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-[13px] text-[#0D6B4E] font-medium">{lineFeedback}</span>
                <button
                  type="submit"
                  disabled={savingLine}
                  className="btn-press btn-primary px-5 py-2.5 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingLine ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า LINE Bot'}
                </button>
              </div>
            </form>
          </div>

          <div className="xl:col-span-5 space-y-5">
            <form onSubmit={handleSimulateLine} className="ledger-surface rounded-[16px] p-5 space-y-3.5">
              <div>
                <h2 className="text-[16px] font-semibold text-[#10201A]">ทดสอบจำลองลูกค้าส่งสลิปเข้า LINE</h2>
                <p className="text-[12.5px] text-[#64756E] mt-0.5">
                  ทดลองตรวจสลิปจริงและดูตัวอย่าง Flex Message ก่อนผูก LINE OA จริง
                </p>
              </div>

              <input
                type="text"
                value={simCustomer}
                onChange={(e) => setSimCustomer(e.target.value)}
                placeholder="ชื่อจำลองของลูกค้า LINE"
                className="input-field !text-[13px]"
              />

              <div
                onClick={() => simFileRef.current?.click()}
                className="rounded-[12px] border-2 border-dashed border-[#C9D4CE] bg-[#F8FAF9] p-4 text-center cursor-pointer hover:border-[#0D6B4E]/60"
              >
                <input
                  ref={simFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePickSimFile(e.target.files?.[0] || null)}
                />
                <UploadCloud className="w-5 h-5 mx-auto text-[#0D6B4E] mb-1" />
                <div className="text-[13px] text-[#42544D] truncate">
                  {simFile ? simFile.name : 'เลือกรูปสลิปเพื่อจำลองการทำงานของ LINE Bot'}
                </div>
                {simQr && (
                  <div className="text-[11.5px] text-[#0D6B4E] font-medium mt-1">สแกนพบ QR บนเบราว์เซอร์แล้ว</div>
                )}
              </div>

              <button
                type="submit"
                disabled={simLoading || !simFile}
                className="btn-press btn-primary w-full py-2.5 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {simLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังตรวจสลิปจำลอง...
                  </>
                ) : (
                  'จำลองรับสลิป LINE และบันทึกรายรับ'
                )}
              </button>

              {simError && (
                <div className="text-[12.5px] text-[#C82829] bg-[#FDECEC] p-2.5 rounded-[8px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{simError}</span>
                </div>
              )}

              {simTx && (
                <button
                  type="button"
                  onClick={() => onInspectTransaction(simTx)}
                  className="w-full text-left rounded-[10px] bg-[#E8F5F0] text-[#0D6B4E] px-3 py-2 text-[12.5px] font-medium flex items-center justify-between cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    บันทึกรายการ #{simTx.id} แล้ว
                  </span>
                  <span className="underline">เปิดดูรายละเอียด</span>
                </button>
              )}
            </form>

            <FlexPreviewCard
              shopName={settings?.shopName || 'ร้านค้าของฉัน'}
              greeting={greeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ'}
              status={simTx?.status || 'VERIFIED'}
              amount={simTx ? simTx.amount : 1250}
              bankName={simTx ? simTx.sendingBankName : 'ธนาคารกสิกรไทย'}
              transferDisplay={simTx ? simTx.transferDisplay : '22 พ.ย. 69 14:25'}
              receiverAccount={simTx ? simTx.receiverAccount : 'xxx-x-x5678-x'}
              transRef={simTx ? simTx.transRef : '016323115453APM13766'}
              customerName={simTx ? simTx.customerName : simCustomer}
              footerOverride={simTx && simTx.status !== 'VERIFIED' ? simTx.verificationMessage : undefined}
            />
          </div>
        </div>
      )}

      {/* TAB 2: FACEBOOK MESSENGER BOT */}
      {pluginTab === 'messenger' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 space-y-5">
            <section className="ledger-surface rounded-[16px] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold text-[#10201A]">
                  1. Callback URL &amp; Verify Token สำหรับ Meta Developers
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                    settings?.hasFbAppSecret && settings?.hasFbPageAccessToken
                      ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                      : 'bg-[#FEF4E6] text-[#B45309]'
                  }`}
                >
                  {settings?.hasFbAppSecret && settings?.hasFbPageAccessToken
                    ? 'ตั้งค่า Page Token แล้ว'
                    : 'รอใส่ App Secret / Page Token'}
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <div className="text-[12px] font-medium text-[#52645D] mb-1">Callback URL</div>
                  <div className="flex items-center gap-2 rounded-[10px] bg-[#F4F6F5] border border-[#E3E8E5] p-2.5">
                    <span className="px-2 py-0.5 rounded-[6px] bg-[#0084FF] text-white font-mono-code text-[11px] font-semibold shrink-0">
                      GET/POST
                    </span>
                    <code className="font-mono-code text-[12.5px] text-[#10201A] truncate flex-1">
                      {fbWebhookUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText('fb-webhook', fbWebhookUrl)}
                      className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedId === 'fb-webhook' ? (
                        <Check className="w-3.5 h-3.5 text-[#0D6B4E]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === 'fb-webhook' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[12px] font-medium text-[#52645D] mb-1">Verify Token</div>
                  <div className="flex items-center gap-2 rounded-[10px] bg-[#F4F6F5] border border-[#E3E8E5] p-2.5">
                    <code className="font-mono-code text-[12.5px] text-[#10201A] truncate flex-1">
                      {settings?.fbVerifyToken || 'กำลังโหลด...'}
                    </code>
                    <button
                      type="button"
                      onClick={() => settings?.fbVerifyToken && copyText('fb-verify', settings.fbVerifyToken)}
                      className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedId === 'fb-verify' ? (
                        <Check className="w-3.5 h-3.5 text-[#0D6B4E]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === 'fb-verify' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateFbToken}
                      disabled={regenFbTokenLoading}
                      className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium cursor-pointer shrink-0"
                    >
                      สุ่มใหม่
                    </button>
                  </div>
                </div>
              </div>

              <ol className="text-[13px] text-[#42544D] space-y-1.5 list-decimal pl-5">
                <li>
                  ไปที่ <strong>Meta for Developers</strong> &gt; สร้างแอปประเภท Business &gt; เพิ่มผลิตภัณฑ์{' '}
                  <strong>Messenger</strong>
                </li>
                <li>
                  ในหัวข้อ <strong>Webhooks</strong> วาง Callback URL (HTTPS เมื่อ Deploy แล้ว) และ Verify Token ด้านบน แล้วกด Verify and Save
                </li>
                <li>
                  ผูกเพจร้านค้าและติ๊ก Subscribe ฟิลด์ <strong>messages</strong> — ใช้งานได้ทั้งบนแอป{' '}
                  <strong>Meta Business Suite / Messenger มือถือ</strong> ตลอด 24 ชม.
                </li>
                <li>คัดลอก <strong>App Secret</strong> และ <strong>Page Access Token</strong> มากรอกด้านล่าง</li>
              </ol>
            </section>

            <form onSubmit={handleSaveFbSettings} className="ledger-surface rounded-[16px] p-5 space-y-4">
              <h2 className="text-[16px] font-semibold text-[#10201A]">2. เชื่อมต่อ Facebook Page และกฎตอบกลับ</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    App Secret {settings?.hasFbAppSecret ? `(${settings.fbAppSecretMasked})` : ''}
                  </label>
                  <input
                    type="password"
                    value={fbAppSecret}
                    onChange={(e) => setFbAppSecret(e.target.value)}
                    placeholder={settings?.hasFbAppSecret ? 'กรอกใหม่เมื่อต้องการเปลี่ยน' : 'วาง App Secret จาก Meta App Settings'}
                    className="input-field font-mono-code !text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    Page Access Token {settings?.hasFbPageAccessToken ? '(บันทึกแล้ว)' : ''}
                  </label>
                  <input
                    type="password"
                    value={fbPageToken}
                    onChange={(e) => setFbPageToken(e.target.value)}
                    placeholder={settings?.hasFbPageAccessToken ? 'กรอกใหม่เมื่อต้องการเปลี่ยน' : 'วาง Page Access Token'}
                    className="input-field font-mono-code !text-[13px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  ข้อความปิดท้ายใบยืนยันใน Messenger (เมื่อตรวจผ่าน)
                </label>
                <input
                  type="text"
                  value={fbGreeting}
                  onChange={(e) => setFbGreeting(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-[#EEF2F0]">
                {[
                  {
                    checked: fbAutoReply,
                    onChange: setFbAutoReply,
                    title: 'ตอบกลับลูกค้าใน Facebook Messenger อัตโนมัติหลังตรวจผ่าน',
                    desc: 'ส่งสรุปยอดโอน ธนาคาร วันเวลา และเลขอ้างอิงกลับเข้าแชตลูกค้าทันที',
                  },
                  {
                    checked: fbReplyOnError,
                    onChange: setFbReplyOnError,
                    title: 'แจ้งกลับในแชตเมื่อสลิปซ้ำ หรือโอนผิดบัญชีร้านค้า',
                    desc: 'ช่วยให้ลูกค้าและแอดมินทราบความผิดปกติทันที',
                  },
                  {
                    checked: fbIgnoreNonSlip,
                    onChange: setFbIgnoreNonSlip,
                    title: 'ข้ามรูปภาพทั่วไปที่ไม่ใช่สลิป (แนะนำ)',
                    desc: 'เมื่อลูกค้าแคปรูปสินค้าส่งมาสอบถามในแชตเพจ บอทจะไม่ตอบรบกวน',
                  },
                  {
                    checked: fbNotifyLineAdmin,
                    onChange: setFbNotifyLineAdmin,
                    title: 'ส่งแจ้งเตือนสลิปจาก Facebook เข้ากลุ่ม LINE แอดมินด้วย',
                    desc: 'รวมการแจ้งเตือนยอดโอนจาก Facebook ไปแจ้งในกลุ่ม LINE เดียวกัน (ต้องตั้งค่า LINE Admin Target ID)',
                  },
                ].map((opt) => (
                  <label
                    key={opt.title}
                    className="flex items-start gap-3 p-2 rounded-[10px] hover:bg-[#F8FAF9] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => opt.onChange(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[#0D6B4E] rounded cursor-pointer"
                    />
                    <div>
                      <div className="text-[13.5px] font-medium text-[#10201A]">{opt.title}</div>
                      <div className="text-[12px] text-[#64756E]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-[13px] text-[#0D6B4E] font-medium">{fbFeedback}</span>
                <button
                  type="submit"
                  disabled={savingFb}
                  className="btn-press btn-primary px-5 py-2.5 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingFb ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า Messenger'}
                </button>
              </div>
            </form>
          </div>

          <div className="xl:col-span-5 space-y-5">
            <form onSubmit={handleSimulateFb} className="ledger-surface rounded-[16px] p-5 space-y-3.5">
              <div>
                <h2 className="text-[16px] font-semibold text-[#10201A]">
                  ทดสอบจำลองลูกค้าส่งสลิปเข้า Facebook Messenger
                </h2>
                <p className="text-[12.5px] text-[#64756E] mt-0.5">
                  ทดลองตรวจสลิปจริงและดูข้อความตอบกลับใน Messenger ก่อนเชื่อมเพจจริง
                </p>
              </div>

              <input
                type="text"
                value={fbSimCustomer}
                onChange={(e) => setFbSimCustomer(e.target.value)}
                placeholder="ชื่อจำลองของลูกค้า Facebook"
                className="input-field !text-[13px]"
              />

              <div
                onClick={() => fbSimFileRef.current?.click()}
                className="rounded-[12px] border-2 border-dashed border-[#C9D4CE] bg-[#F8FAF9] p-4 text-center cursor-pointer hover:border-[#0084FF]/60"
              >
                <input
                  ref={fbSimFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePickFbSimFile(e.target.files?.[0] || null)}
                />
                <UploadCloud className="w-5 h-5 mx-auto text-[#0084FF] mb-1" />
                <div className="text-[13px] text-[#42544D] truncate">
                  {fbSimFile ? fbSimFile.name : 'เลือกรูปสลิปเพื่อจำลองแชต Facebook Messenger'}
                </div>
                {fbSimQr && (
                  <div className="text-[11.5px] text-[#0D6B4E] font-medium mt-1">สแกนพบ QR บนเบราว์เซอร์แล้ว</div>
                )}
              </div>

              <button
                type="submit"
                disabled={fbSimLoading || !fbSimFile}
                className="btn-press btn-primary w-full py-2.5 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {fbSimLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังตรวจสลิปจำลอง...
                  </>
                ) : (
                  'จำลองรับสลิป Messenger และบันทึกรายรับ'
                )}
              </button>

              {fbSimError && (
                <div className="text-[12.5px] text-[#C82829] bg-[#FDECEC] p-2.5 rounded-[8px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fbSimError}</span>
                </div>
              )}

              {fbSimTx && (
                <button
                  type="button"
                  onClick={() => onInspectTransaction(fbSimTx)}
                  className="w-full text-left rounded-[10px] bg-[#E8F5F0] text-[#0D6B4E] px-3 py-2 text-[12.5px] font-medium flex items-center justify-between cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    บันทึกรายการ #{fbSimTx.id} แล้ว
                  </span>
                  <span className="underline">เปิดดูรายละเอียด</span>
                </button>
              )}
            </form>

            <MessengerPreviewCard
              shopName={settings?.shopName || 'ร้านค้าของฉัน'}
              greeting={fbGreeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ'}
              status={fbSimTx?.status || 'VERIFIED'}
              amount={fbSimTx ? fbSimTx.amount : 1250}
              bankName={fbSimTx ? fbSimTx.sendingBankName : 'ธนาคารกสิกรไทย'}
              transferDisplay={fbSimTx ? fbSimTx.transferDisplay : '22 พ.ย. 69 14:25'}
              receiverAccount={fbSimTx ? fbSimTx.receiverAccount : 'xxx-x-x5678-x'}
              transRef={fbSimTx ? fbSimTx.transRef : '016323115453APM13766'}
              customerName={fbSimTx ? fbSimTx.customerName : fbSimCustomer}
              replyTextOverride={fbSimReplyText || undefined}
            />
          </div>
        </div>
      )}

      {/* TAB 3: CHROME EXTENSION */}
      {pluginTab === 'extension' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 ledger-surface rounded-[16px] p-6 space-y-5">
            <div>
              <h2 className="text-[17px] font-bold text-[#10201A]">
                Chrome Extension สำหรับ LINE OA &amp; Facebook Messenger (บนคอมพิวเตอร์)
              </h2>
              <p className="text-[13.5px] text-[#52645D] mt-1">
                ตัวเดียวรองรับทั้ง <code className="font-mono-code">chat.line.biz</code>,{' '}
                <code className="font-mono-code">business.facebook.com</code> และ{' '}
                <code className="font-mono-code">messenger.com</code> โดยไม่ต้องตั้งค่า Webhook หรือชนกับบอทเจ้าอื่น
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[12.5px] font-semibold text-[#42544D] mb-1">
                  1. Dashboard Server URL (นำไปวางใน Popup ของ Extension)
                </div>
                <div className="flex items-center gap-2 rounded-[10px] bg-[#F4F6F5] border border-[#E3E8E5] p-2.5">
                  <code className="font-mono-code text-[13px] text-[#10201A] truncate flex-1">
                    {origin}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText('origin', origin)}
                    className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'origin' ? (
                      <Check className="w-3.5 h-3.5 text-[#0D6B4E]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'origin' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[12.5px] font-semibold text-[#42544D] mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#0D6B4E]" />
                  2. Seller Extension API Key
                </div>
                <div className="flex items-center gap-2 rounded-[10px] bg-[#F4F6F5] border border-[#E3E8E5] p-2.5">
                  <code className="font-mono-code text-[13px] text-[#10201A] truncate flex-1">
                    {settings?.extensionApiKey || 'กำลังโหลด...'}
                  </code>
                  <button
                    type="button"
                    onClick={() => settings?.extensionApiKey && copyText('apikey', settings.extensionApiKey)}
                    className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'apikey' ? (
                      <Check className="w-3.5 h-3.5 text-[#0D6B4E]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === 'apikey' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateKey}
                    disabled={regenLoading}
                    className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium cursor-pointer"
                  >
                    สุ่มใหม่
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[12px] bg-[#F8FAF9] border border-[#E3E8E5] p-4 space-y-2">
              <h3 className="text-[14px] font-semibold text-[#10201A]">วิธีติดตั้งบน Google Chrome / Microsoft Edge</h3>
              <ol className="text-[13px] text-[#42544D] space-y-1.5 list-decimal pl-5">
                <li>
                  เปิด <code className="font-mono-code bg-white px-1.5 py-0.5 rounded border border-[#E3E8E5]">chrome://extensions</code> แล้วเปิด <strong>Developer mode</strong>
                </li>
                <li>
                  กด <strong>Load unpacked</strong> แล้วเลือกโฟลเดอร์ <code className="font-mono-code bg-white px-1.5 py-0.5 rounded border border-[#E3E8E5]">line-chat-extension</code>
                </li>
                <li>คลิกไอคอน <strong>SlipFlow</strong> วาง Dashboard URL และ API Key แล้วกดเชื่อมต่อ</li>
                <li>เปิดหน้า <code className="font-mono-code bg-white px-1.5 py-0.5 rounded border border-[#E3E8E5]">chat.line.biz</code> หรือ <code className="font-mono-code bg-white px-1.5 py-0.5 rounded border border-[#E3E8E5]">business.facebook.com</code> ใช้งานได้ทันที</li>
              </ol>
            </div>
          </section>

          <section className="lg:col-span-5 ledger-surface rounded-[16px] p-6 space-y-4">
            <h3 className="text-[15.5px] font-semibold text-[#10201A]">รองรับทั้ง 2 แพลตฟอร์มอัตโนมัติ</h3>
            <ul className="space-y-3 text-[13.5px] text-[#42544D]">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#06C755] shrink-0 mt-1" />
                <span>
                  <strong>LINE OA Manager (chat.line.biz)</strong> — บันทึกช่องทางเป็น LINE Chat Plug-in พร้อมชื่อลูกค้า
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#0084FF] shrink-0 mt-1" />
                <span>
                  <strong>Meta Business Suite / Messenger Web</strong> — บันทึกช่องทางเป็น FB Inbox Plug-in แยกสถิติชัดเจน
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#0D6B4E] shrink-0 mt-1" />
                <span>ติดป้ายผลตรวจ ผ่าน/สลิปซ้ำ/ผิดบัญชี ใต้รูปในแชตทันที และซิงค์รายรับเข้าหน้า Dashboard เรียลไทม์</span>
              </li>
            </ul>
          </section>
        </div>
      )}

      {/* Unified Webhook Activity Log (shown on Bot tabs) */}
      {pluginTab !== 'extension' && (
        <section className="ledger-surface rounded-[16px] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E3E8E5] flex items-center justify-between">
            <div>
              <h2 className="text-[15.5px] font-semibold text-[#10201A]">
                บันทึกกิจกรรม Webhook ล่าสุด (LINE &amp; Facebook Messenger)
              </h2>
              <p className="text-[12.5px] text-[#64756E]">แสดงประวัติอีเวนต์ที่เข้ามาจากทั้งสองแพลตฟอร์ม</p>
            </div>
            <button
              type="button"
              onClick={onRefreshLogs}
              className="btn-press btn-secondary px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              รีเฟรช
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D] text-[12px]">
                  <th className="py-2.5 px-4 font-semibold">เวลา</th>
                  <th className="py-2.5 px-4 font-semibold">เหตุการณ์</th>
                  <th className="py-2.5 px-4 font-semibold">ผู้ส่ง / ห้อง</th>
                  <th className="py-2.5 px-4 font-semibold">ผลลัพธ์</th>
                  <th className="py-2.5 px-4 font-semibold">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F0]">
                {webhookLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#64756E]">
                      ยังไม่มีบันทึกกิจกรรม Webhook
                    </td>
                  </tr>
                ) : (
                  webhookLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-[#42544D]">
                        {formatRecordedTime(log.createdAt).main}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap font-mono-code text-[12px]">
                        {log.eventType}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {log.customerName || log.sourceId || '-'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#F4F6F5] text-[#10201A]">
                          {log.outcome}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#42544D]">{log.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
