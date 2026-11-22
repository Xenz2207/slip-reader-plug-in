import { useEffect, useState } from 'react';
import { Building2, Plus, Trash2, CheckCircle2, RefreshCw, Tag, ShieldCheck } from 'lucide-react';
import type {
  CategoryItem,
  PublicSettings,
  RemoteSlipApiHealth,
  SellerAccount,
  ThaiBankOption,
} from '../types';
import { api } from '../lib/api';

interface SettingsPageProps {
  settings: PublicSettings | null;
  sellerAccounts: SellerAccount[];
  categories: CategoryItem[];
  banks: ThaiBankOption[];
  slipApiHealth: RemoteSlipApiHealth | null;
  onSettingsUpdated: (s: PublicSettings) => void;
  onAccountsChanged: () => void;
  onCategoriesChanged: () => void;
  onRecheckSlipApi: () => Promise<void>;
}

export function SettingsPage({
  settings,
  sellerAccounts,
  categories,
  banks,
  slipApiHealth,
  onSettingsUpdated,
  onAccountsChanged,
  onCategoriesChanged,
  onRecheckSlipApi,
}: SettingsPageProps) {
  // General & verification rules
  const [shopName, setShopName] = useState('');
  const [slipApiBaseUrl, setSlipApiBaseUrl] = useState('');
  const [checkReceiverAccount, setCheckReceiverAccount] = useState(true);
  const [rejectDuplicateSlip, setRejectDuplicateSlip] = useState(true);
  const [minAmount, setMinAmount] = useState('0');
  const [savingRules, setSavingRules] = useState(false);
  const [rulesMsg, setRulesMsg] = useState('');
  const [checkingApi, setCheckingApi] = useState(false);

  // Add seller account form
  const [bankCode, setBankCode] = useState('004');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'BANK' | 'PROMPTPAY'>('BANK');
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountErr, setAccountErr] = useState('');

  // Add category form
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('#0D6B4E');
  const [catErr, setCatErr] = useState('');

  useEffect(() => {
    if (!settings) return;
    setShopName(settings.shopName);
    setSlipApiBaseUrl(settings.slipApiBaseUrl);
    setCheckReceiverAccount(settings.checkReceiverAccount);
    setRejectDuplicateSlip(settings.rejectDuplicateSlip);
    setMinAmount(String(settings.minAmount || 0));
  }, [settings]);

  async function handleSaveRules(e: React.FormEvent) {
    e.preventDefault();
    setSavingRules(true);
    setRulesMsg('');
    try {
      const res = await api.updateSettings({
        shopName: shopName.trim() || 'ร้านค้าของฉัน',
        slipApiBaseUrl: slipApiBaseUrl.trim() || 'https://my-slip-reader.onrender.com',
        checkReceiverAccount,
        rejectDuplicateSlip,
        minAmount: Math.max(0, Number(minAmount || 0)),
      });
      onSettingsUpdated(res.settings);
      setRulesMsg('บันทึกการตั้งค่าเรียบร้อยแล้ว');
      setTimeout(() => setRulesMsg(''), 3000);
    } catch (err) {
      setRulesMsg(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingRules(false);
    }
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accountNumber.trim() || !accountName.trim()) {
      setAccountErr('กรุณากรอกเลขบัญชีและชื่อบัญชีให้ครบถ้วน');
      return;
    }
    setAddingAccount(true);
    setAccountErr('');
    try {
      const selectedBank = banks.find((b) => b.code === bankCode);
      await api.createSellerAccount({
        bankCode,
        bankName: selectedBank?.th || (accountType === 'PROMPTPAY' ? 'พร้อมเพย์' : 'ธนาคาร'),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        accountType: bankCode === 'PROMPTPAY' ? 'PROMPTPAY' : accountType,
      });
      setAccountNumber('');
      setAccountName('');
      onAccountsChanged();
    } catch (err) {
      setAccountErr(err instanceof Error ? err.message : 'เพิ่มบัญชีไม่สำเร็จ');
    } finally {
      setAddingAccount(false);
    }
  }

  async function handleToggleAccount(acc: SellerAccount) {
    await api.updateSellerAccount(acc.id, { isActive: !acc.isActive });
    onAccountsChanged();
  }

  async function handleDeleteAccount(acc: SellerAccount) {
    if (!window.confirm(`ต้องการลบบัญชี ${acc.bankName} (${acc.accountNumber}) ใช่หรือไม่?`)) return;
    await api.deleteSellerAccount(acc.id);
    onAccountsChanged();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatErr('');
    try {
      await api.createCategory({ name: catName.trim(), color: catColor });
      setCatName('');
      onCategoriesChanged();
    } catch (err) {
      setCatErr(err instanceof Error ? err.message : 'เพิ่มหมวดหมู่ไม่สำเร็จ');
    }
  }

  async function handleRecheck() {
    setCheckingApi(true);
    try {
      await onRecheckSlipApi();
    } finally {
      setCheckingApi(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-[#10201A]">บัญชีร้านค้าและตั้งค่าระบบตรวจสลิป</h1>
        <p className="text-[13.5px] text-[#52645D] mt-0.5">
          กำหนดเลขบัญชีปลายทางของร้านค้าเพื่อป้องกันสลิปโอนผิดบัญชี และจัดการกฎการรับยอดอัตโนมัติ
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Seller Bank Accounts Whitelist */}
        <section className="xl:col-span-7 ledger-surface rounded-[16px] p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-[#10201A] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0D6B4E]" />
                บัญชีรับเงินของร้านค้า (Whitelist)
              </h2>
              <p className="text-[12.5px] text-[#64756E] mt-0.5">
                รองรับการเทียบเลขบัญชีที่ถูกปิดบางหลักบนสลิป (เช่น <code className="font-mono-code">xxx-x-x5678-x</code>) และชื่อบัญชีจาก OCR
              </p>
            </div>
          </div>

          <form onSubmit={handleAddAccount} className="rounded-[12px] bg-[#F8FAF9] border border-[#E3E8E5] p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#42544D] mb-1">ธนาคาร / ช่องทางรับเงิน</label>
                <select
                  value={bankCode}
                  onChange={(e) => {
                    setBankCode(e.target.value);
                    setAccountType(e.target.value === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK');
                  }}
                  className="input-field !text-[13.5px]"
                >
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.th} ({b.short})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#42544D] mb-1">
                  เลขบัญชีเต็ม หรือเลขพร้อมเพย์ (แนะนำใส่ครบ 10 หลัก)
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="เช่น 012-3-45678-9 หรือ 0812345678"
                  className="input-field font-mono-code !text-[13px]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-[12px] font-medium text-[#42544D] mb-1">
                  ชื่อบัญชีร้านค้า (ไทยหรืออังกฤษ)
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="เช่น นาย สมชาย ใจดี หรือ บจก. ร้านค้าดี"
                  className="input-field !text-[13.5px]"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingAccount}
                  className="btn-press btn-primary w-full sm:w-auto px-4 py-2.5 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มบัญชีร้าน
                </button>
              </div>
            </div>

            {accountErr && <p className="text-[12.5px] text-[#C82829]">{accountErr}</p>}
          </form>

          <div className="divide-y divide-[#EEF2F0] border border-[#E3E8E5] rounded-[12px] overflow-hidden">
            {sellerAccounts.length === 0 ? (
              <div className="py-8 px-4 text-center text-[13px] text-[#64756E]">
                ยังไม่มีบัญชีร้านค้าที่ลงทะเบียน (เพิ่มอย่างน้อย 1 บัญชีเพื่อเปิดใช้ระบบกันสลิปโอนผิดบัญชี)
              </div>
            ) : (
              sellerAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                    acc.isActive ? 'bg-white' : 'bg-[#F8FAF9] opacity-65'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] text-[#10201A]">{acc.bankName}</span>
                      <span className="font-mono-code text-[13px] text-[#0D6B4E] font-semibold">
                        {acc.accountNumber}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-[#52645D] mt-0.5">{acc.accountName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleAccount(acc)}
                      className={`btn-press px-2.5 py-1 rounded-[8px] text-[12px] font-semibold cursor-pointer ${
                        acc.isActive
                          ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                          : 'bg-[#EEF1F0] text-[#52645D]'
                      }`}
                    >
                      {acc.isActive ? 'ใช้งานอยู่' : 'ปิดชั่วคราว'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAccount(acc)}
                      className="btn-press p-1.5 rounded-[8px] text-[#64756E] hover:text-[#C82829] hover:bg-[#FDECEC] cursor-pointer"
                      aria-label="ลบบัญชี"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right 5 cols: Verification Rules + Slip Reader API Health + Categories */}
        <div className="xl:col-span-5 space-y-5">
          <form onSubmit={handleSaveRules} className="ledger-surface rounded-[16px] p-5 space-y-4">
            <h2 className="text-[16px] font-semibold text-[#10201A] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0D6B4E]" />
              กฎการตรวจสลิปและเชื่อมต่อ API
            </h2>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">ชื่อร้านค้า</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                Slip Reader API Endpoint
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={slipApiBaseUrl}
                  onChange={(e) => setSlipApiBaseUrl(e.target.value)}
                  className="input-field font-mono-code !text-[12.5px]"
                />
                <button
                  type="button"
                  onClick={() => void handleRecheck()}
                  disabled={checkingApi}
                  className="btn-press btn-secondary px-3 py-2 rounded-[10px] text-[12.5px] font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingApi ? 'animate-spin' : ''}`} />
                  เช็กสถานะ
                </button>
              </div>
              {slipApiHealth && (
                <div
                  className={`mt-2 rounded-[8px] px-3 py-2 text-[12px] flex items-center justify-between ${
                    slipApiHealth.online
                      ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                      : 'bg-[#FDECEC] text-[#C82829]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-medium truncate">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {slipApiHealth.online
                      ? `ออนไลน์ · v${slipApiHealth.version} (${slipApiHealth.latencyMs}ms)`
                      : slipApiHealth.error || 'เชื่อมต่อไม่ได้'}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                ยอดโอนขั้นต่ำที่ยอมรับอัตโนมัติ (บาท · 0 = ไม่จำกัด)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="input-field tabular-nums"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkReceiverAccount}
                  onChange={(e) => setCheckReceiverAccount(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[#0D6B4E] cursor-pointer"
                />
                <span className="text-[13px] text-[#10201A]">
                  ตรวจบัญชีปลายทางตรงกับ Whitelist ของร้านค้า
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rejectDuplicateSlip}
                  onChange={(e) => setRejectDuplicateSlip(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[#0D6B4E] cursor-pointer"
                />
                <span className="text-[13px] text-[#10201A]">
                  ปฏิเสธและแจ้งเตือนเมื่อพบเลขอ้างอิง (transRef) ซ้ำในระบบ
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[12.5px] text-[#0D6B4E] font-medium">{rulesMsg}</span>
              <button
                type="submit"
                disabled={savingRules}
                className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingRules ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </form>

          {/* Categories Management */}
          <section className="ledger-surface rounded-[16px] p-5 space-y-3.5">
            <h2 className="text-[15.5px] font-semibold text-[#10201A] flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#0D6B4E]" />
              หมวดหมู่รายรับ
            </h2>

            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="color"
                value={catColor}
                onChange={(e) => setCatColor(e.target.value)}
                className="w-10 h-10 p-1 rounded-[10px] border border-[#C9D4CE] bg-white cursor-pointer shrink-0"
                aria-label="เลือกสีหมวดหมู่"
              />
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="เพิ่มหมวดหมู่ใหม่ เช่น ขายส่ง"
                className="input-field !text-[13.5px]"
              />
              <button
                type="submit"
                className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13px] font-semibold shrink-0 cursor-pointer"
              >
                เพิ่ม
              </button>
            </form>
            {catErr && <p className="text-[12px] text-[#C82829]">{catErr}</p>}

            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F4F6F5] border border-[#E3E8E5] text-[12.5px] font-medium text-[#10201A]"
                >
                  <span style={{ backgroundColor: cat.color }} className="w-2.5 h-2.5 rounded-full" />
                  {cat.name}
                  {!cat.isDefault && (
                    <button
                      type="button"
                      onClick={() => void api.deleteCategory(cat.id).then(onCategoriesChanged)}
                      className="ml-1 text-[#64756E] hover:text-[#C82829] cursor-pointer"
                      aria-label={`ลบหมวดหมู่ ${cat.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
