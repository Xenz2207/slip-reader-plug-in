import { useState } from 'react';
import { ShieldCheck, Store, Lock, User, Loader2, CheckCircle2 } from 'lucide-react';
import type { AuthUser, ShopInfo } from '../types';
import { api, authStorage } from '../lib/api';

interface AuthPageProps {
  onAuthenticated: (data: {
    user: AuthUser;
    shops: ShopInfo[];
    activeShopId: number;
  }) => void;
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res =
        mode === 'register'
          ? await api.register({
              username: username.trim(),
              password,
              shopName: shopName.trim(),
            })
          : await api.login({
              username: username.trim(),
              password,
            });

      authStorage.setToken(res.token);
      if (res.activeShopId) {
        authStorage.setShopId(res.activeShopId);
      }
      onAuthenticated({
        user: res.user,
        shops: res.shops,
        activeShopId: res.activeShopId,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F5] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[920px] grid grid-cols-1 lg:grid-cols-12 rounded-[20px] overflow-hidden ledger-elevated bg-white">
        {/* Left Brand Panel */}
        <div className="lg:col-span-5 bg-[#0F241D] text-white p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-[12px] bg-[#0D6B4E] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-[18px] font-bold leading-tight">SlipFlow</div>
                <div className="text-[12px] text-[#9BC1B2]">Multi-Shop Slip &amp; Revenue Ledger</div>
              </div>
            </div>

            <h1 className="mt-7 text-[22px] font-bold leading-snug">
              ระบบตรวจสลิปอัตโนมัติและบัญชีรายรับ แยกอิสระแต่ละร้านค้า
            </h1>
            <p className="mt-2.5 text-[13.5px] text-[#B8D4C9] leading-relaxed">
              รองรับผู้ขายหลายร้านในระบบเดียว โดยแยกข้อมูลสลิป บัญชีธนาคารรับเงิน และ Token ของ LINE OA / Facebook Messenger ออกจากกัน 100%
            </p>
          </div>

          <ul className="mt-8 space-y-3 text-[13px] text-[#D4ECE2]">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
              <span>Webhook URL ของ LINE OA และ Facebook Messenger แยกเฉพาะแต่ละร้าน</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
              <span>ตั้งเลขบัญชีธนาคาร / พร้อมเพย์ Whitelist แยกตามร้าน</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0 mt-0.5" />
              <span>1 บัญชีผู้ใช้สามารถสร้างและสลับดูยอดได้หลายร้านค้า</span>
            </li>
          </ul>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-7 sm:p-9 flex flex-col justify-center">
          <div className="inline-flex rounded-[12px] bg-[#F4F6F5] p-1 border border-[#E3E8E5] mb-6 self-start">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`btn-press px-4 py-2 rounded-[8px] text-[13.5px] font-semibold cursor-pointer ${
                mode === 'login' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
              }`}
            >
              เข้าสู่ระบบร้านค้า
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg('');
              }}
              className={`btn-press px-4 py-2 rounded-[8px] text-[13.5px] font-semibold cursor-pointer ${
                mode === 'register' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
              }`}
            >
              สมัครเปิดร้านใหม่
            </button>
          </div>

          <h2 className="text-[20px] font-bold text-[#10201A]">
            {mode === 'login' ? 'เข้าสู่ระบบจัดการร้านค้า' : 'สร้างบัญชีและเปิดร้านค้าใหม่'}
          </h2>
          <p className="text-[13.5px] text-[#52645D] mt-1 mb-5">
            {mode === 'login'
              ? 'กรอกชื่อผู้ใช้งานและรหัสผ่านเพื่อเข้าถึงสมุดรายรับและตั้งค่า LINE / Facebook ของร้านคุณ'
              : 'ระบบจะสร้างพื้นที่ข้อมูลร้านค้าใหม่พร้อม Webhook URL และ API Key เฉพาะร้านให้อัตโนมัติ'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-[13px] font-medium text-[#42544D] mb-1">
                  ชื่อร้านค้า *
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-[#64756E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="เช่น ร้านเสื้อผ้ามินิมอล หรือ คาเฟ่สาขา 1"
                    className="input-field !pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-[#42544D] mb-1">
                ชื่อผู้ใช้งาน (Username หรือ อีเมล) *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#64756E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  minLength={3}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="เช่น shopowner01"
                  className="input-field !pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#42544D] mb-1">
                รหัสผ่าน {mode === 'register' ? '(อย่างน้อย 6 ตัวอักษร)' : ''} *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64756E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field !pl-10"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-[10px] bg-[#FDECEC] text-[#C82829] px-3.5 py-2.5 text-[13px]">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-press btn-primary w-full py-2.5 px-4 rounded-[10px] text-[14px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังดำเนินการ...
                </>
              ) : mode === 'login' ? (
                'เข้าสู่ระบบ'
              ) : (
                'สมัครสมาชิกและเปิดร้านค้า'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
