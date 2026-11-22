import {
  LayoutDashboard,
  ReceiptText,
  MessageSquareCode,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
  ExternalLink,
  Store,
  Plus,
  LogOut,
} from 'lucide-react';
import type { AuthUser, RemoteSlipApiHealth, ShopInfo } from '../types';

export type NavKey = 'overview' | 'transactions' | 'line-plugin' | 'settings';

interface SidebarNavProps {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  shopName: string;
  user: AuthUser;
  shops: ShopInfo[];
  activeShopId: number;
  onSwitchShop: (shopId: number) => void;
  onCreateShopClick: () => void;
  onLogout: () => void;
  sseConnected: boolean;
  alertCount: number;
  slipApiHealth: RemoteSlipApiHealth | null;
}

const NAV_ITEMS: Array<{ key: NavKey; label: string; shortLabel: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'ภาพรวมรายรับ', shortLabel: 'ภาพรวม', icon: LayoutDashboard },
  { key: 'transactions', label: 'สมุดรายการสลิป', shortLabel: 'รายการ', icon: ReceiptText },
  { key: 'line-plugin', label: 'ปลั๊กอิน LINE / FB', shortLabel: 'ปลั๊กอิน', icon: MessageSquareCode },
  { key: 'settings', label: 'บัญชีร้านและตั้งค่า', shortLabel: 'ตั้งค่า', icon: Settings2 },
];

export function SidebarNav({
  active,
  onSelect,
  shopName,
  user,
  shops,
  activeShopId,
  onSwitchShop,
  onCreateShopClick,
  onLogout,
  sseConnected,
  alertCount,
  slipApiHealth,
}: SidebarNavProps) {
  return (
    <>
      {/* Desktop Ledger Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[254px] lg:shrink-0 bg-[#0F241D] text-white min-h-screen sticky top-0 h-screen select-none">
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] bg-[#0D6B4E] flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-[16px] font-bold tracking-tight text-white leading-tight">
                SlipFlow
              </div>
              <div className="text-[11.5px] text-[#9BC1B2] truncate mt-0.5">
                ผู้ใช้: {user.username}
              </div>
            </div>
          </div>

          {/* Multi-Shop Switcher */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-[11.5px] text-[#9BC1B2]">
              <span className="inline-flex items-center gap-1">
                <Store className="w-3.5 h-3.5" />
                ร้านค้าที่กำลังจัดการ
              </span>
              <button
                type="button"
                onClick={onCreateShopClick}
                className="text-[#4ADE80] hover:underline inline-flex items-center gap-0.5 cursor-pointer font-medium"
              >
                <Plus className="w-3 h-3" />
                เพิ่มร้าน
              </button>
            </div>
            <select
              value={activeShopId}
              onChange={(e) => onSwitchShop(Number(e.target.value))}
              aria-label="สลับร้านค้า"
              className="w-full rounded-[9px] bg-white/10 border border-white/15 text-white px-2.5 py-2 text-[13px] font-semibold focus:outline-none focus:border-[#4ADE80] cursor-pointer"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id} className="text-[#10201A] bg-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-[9px] bg-white/[0.06] text-[11.5px]">
            {sseConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#06C755] shrink-0" />
                <span className="text-[#D4ECE2] font-medium">ซิงค์สลิปแบบเรียลไทม์</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="text-amber-200 font-medium">กำลังเชื่อมต่อใหม่...</span>
              </>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={`btn-press w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[14px] font-medium cursor-pointer text-left ${
                  isActive
                    ? 'bg-[#0D6B4E] text-white shadow-sm'
                    : 'text-[#B8D4C9] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.key === 'transactions' && alertCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-[#C82829] text-white">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          <div className="rounded-[10px] bg-white/[0.05] px-3 py-2.5 text-[12px]">
            <div className="flex items-center justify-between text-[#9BC1B2]">
              <span className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                Slip Reader API
              </span>
              <span
                className={`font-semibold ${
                  slipApiHealth === null
                    ? 'text-[#9BC1B2]'
                    : slipApiHealth.online
                      ? 'text-[#4ADE80]'
                      : 'text-amber-300'
                }`}
              >
                {slipApiHealth === null
                  ? 'กำลังตรวจ'
                  : slipApiHealth.online
                    ? `ออนไลน์ ${slipApiHealth.latencyMs}ms`
                    : 'ออฟไลน์'}
              </span>
            </div>
            <a
              href={slipApiHealth?.baseUrl || 'https://my-slip-reader.onrender.com'}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-[#CBE2D8] hover:text-white underline-offset-2 hover:underline"
            >
              <span className="truncate max-w-[170px]">my-slip-reader.onrender.com</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="btn-press w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[9px] bg-white/[0.06] hover:bg-white/12 text-[12.5px] font-medium text-[#D4ECE2] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile Top + Bottom Navigation */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#0F241D] text-white px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-[8px] bg-[#0D6B4E] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <select
            value={activeShopId}
            onChange={(e) => onSwitchShop(Number(e.target.value))}
            aria-label="สลับร้านค้า"
            className="rounded-[8px] bg-white/10 border border-white/15 text-white px-2 py-1 text-[13px] font-semibold max-w-[170px] truncate"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id} className="text-[#10201A] bg-white">
                {s.name || shopName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreateShopClick}
            className="p-1.5 rounded-[7px] bg-white/10 text-[#4ADE80]"
            aria-label="เพิ่มร้านค้า"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-2.5 py-1 rounded-[7px] bg-white/10 text-[11.5px] text-[#D4ECE2] inline-flex items-center gap-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          ออก
        </button>
      </header>

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E3E8E5] grid grid-cols-4 px-1 py-1.5 shadow-[0_-2px_10px_rgba(16,32,26,0.06)]"
        aria-label="เมนูหลักมือถือ"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`btn-press relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-[10px] text-[11.5px] font-medium ${
                isActive ? 'text-[#0D6B4E] bg-[#E8F5F0]' : 'text-[#52645D]'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{item.shortLabel}</span>
              {item.key === 'transactions' && alertCount > 0 && (
                <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-[#C82829] text-white text-[10px] font-bold flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
