import { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  Store,
  Users,
  Search,
  RefreshCw,
  Plus,
  KeyRound,
  ExternalLink,
  Trash2,
  X,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import type { AdminPlatformOverview, AdminShopSummary, AdminUserSummary } from '../types';
import { api } from '../lib/api';
import { formatBaht, formatRecordedTime } from '../lib/format';

interface AdminPageProps {
  currentUserId: number;
  onInspectShop: (shopId: number) => void;
  onShopsChanged: () => void;
}

export function AdminPage({ currentUserId, onInspectShop, onShopsChanged }: AdminPageProps) {
  const [data, setData] = useState<AdminPlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'shops' | 'users'>('shops');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');

  // Create new seller account + shop modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [newRole, setNewRole] = useState<'SELLER' | 'ADMIN'>('SELLER');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AdminUserSummary | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetErr, setResetErr] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminOverview();
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3500);
  }

  async function handleToggleShopActive(shop: AdminShopSummary) {
    await api.adminUpdateShop(shop.id, { isActive: !shop.isActive });
    flash(shop.isActive ? `ระงับร้าน ${shop.name} ชั่วคราวแล้ว` : `เปิดใช้งานร้าน ${shop.name} แล้ว`);
    void loadOverview();
    onShopsChanged();
  }

  async function handleDeleteShop(shop: AdminShopSummary) {
    if (
      !window.confirm(
        `ต้องการลบร้าน "${shop.name}" และข้อมูลสลิปทั้งหมดของร้านนี้ถาวรใช่หรือไม่?`
      )
    ) {
      return;
    }
    await api.adminDeleteShop(shop.id);
    flash(`ลบร้าน ${shop.name} เรียบร้อยแล้ว`);
    void loadOverview();
    onShopsChanged();
  }

  async function handleToggleUserActive(u: AdminUserSummary) {
    try {
      await api.adminUpdateUser(u.id, { isActive: !u.isActive });
      flash(u.isActive ? `ระงับบัญชี @${u.username} แล้ว` : `เปิดใช้งานบัญชี @${u.username} แล้ว`);
      void loadOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ');
    }
  }

  async function handleToggleUserRole(u: AdminUserSummary) {
    const nextRole = u.role === 'ADMIN' ? 'SELLER' : 'ADMIN';
    if (
      !window.confirm(
        `ต้องการเปลี่ยนสิทธิ์ของ @${u.username} เป็น ${nextRole} ใช่หรือไม่?`
      )
    ) {
      return;
    }
    try {
      await api.adminUpdateUser(u.id, { role: nextRole });
      flash(`อัปเดตสิทธิ์ของ @${u.username} เป็น ${nextRole} แล้ว`);
      void loadOverview();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เปลี่ยนสิทธิ์ไม่สำเร็จ');
    }
  }

  async function handleDeleteUser(u: AdminUserSummary) {
    if (
      !window.confirm(
        `ต้องการลบบัญชีผู้ใช้ @${u.username} และร้านค้าในความดูแลทั้งหมดถาวรใช่หรือไม่?`
      )
    ) {
      return;
    }
    try {
      await api.adminDeleteUser(u.id);
      flash(`ลบบัญชี @${u.username} เรียบร้อยแล้ว`);
      void loadOverview();
      onShopsChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ลบบัญชีไม่สำเร็จ');
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    try {
      await api.adminCreateUser({
        username: newUsername.trim(),
        password: newPassword,
        shopName: newShopName.trim(),
        role: newRole,
      });
      setShowCreateUser(false);
      setNewUsername('');
      setNewPassword('');
      setNewShopName('');
      setNewRole('SELLER');
      flash('สร้างบัญชีผู้ใช้และเปิดร้านค้าใหม่เรียบร้อยแล้ว');
      void loadOverview();
      onShopsChanged();
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'สร้างบัญชีไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetSaving(true);
    setResetErr('');
    try {
      await api.adminUpdateUser(resetTarget.id, { newPassword: resetPasswordInput });
      flash(`รีเซ็ตรหัสผ่านของ @${resetTarget.username} เรียบร้อยแล้ว`);
      setResetTarget(null);
      setResetPasswordInput('');
    } catch (err) {
      setResetErr(err instanceof Error ? err.message : 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    } finally {
      setResetSaving(false);
    }
  }

  const q = search.trim().toLowerCase();
  const filteredShops = (data?.shops || []).filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.webhookSlug.toLowerCase().includes(q) ||
      s.ownerUsername.toLowerCase().includes(q)
  );
  const filteredUsers = (data?.users || []).filter(
    (u) => !q || u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[12px] font-bold mb-1">
            <Crown className="w-3.5 h-3.5" />
            Super Admin Console
          </div>
          <h1 className="text-[22px] font-bold text-[#10201A]">
            ดูแลภาพรวมระบบและจัดการบัญชีร้านค้าทั้งหมด
          </h1>
          <p className="text-[13.5px] text-[#52645D] mt-0.5">
            ตรวจสอบยอดรวมทุกเพจ/ทุกร้าน สลับเข้าไปช่วยตั้งค่าร้านค้า สร้างบัญชีใหม่ หรือรีเซ็ตรหัสผ่านให้ร้านค้า
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreateUser(true)}
            className="btn-press btn-primary px-3.5 py-2 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            สร้างบัญชีร้านค้าใหม่
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="btn-press btn-secondary px-3 py-2 rounded-[10px] text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-[12px] bg-[#E8F5F0] border border-[#B7DFD0] text-[#0D6B4E] px-4 py-2.5 text-[13.5px] font-medium">
          {feedback}
        </div>
      )}

      {/* Platform KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="ledger-surface rounded-[14px] p-4">
          <div className="text-[12.5px] text-[#64756E]">ร้านค้าทั้งหมดในระบบ</div>
          <div className="text-[26px] font-bold tabular-nums text-[#10201A] mt-1">
            {data?.kpis.activeShops ?? 0}{' '}
            <span className="text-[14px] font-normal text-[#64756E]">
              / {data?.kpis.totalShops ?? 0} ร้าน
            </span>
          </div>
          <div className="text-[12px] text-[#52645D] mt-1">
            บัญชีผู้ใช้ทั้งหมด {data?.kpis.totalUsers ?? 0} บัญชี (Admin {data?.kpis.adminUsers ?? 0})
          </div>
        </div>

        <div className="ledger-surface rounded-[14px] p-4">
          <div className="text-[12.5px] text-[#64756E]">ยอดโอนยืนยันรวมทุกร้าน (วันนี้)</div>
          <div className="text-[26px] font-bold tabular-nums text-[#0D6B4E] mt-1">
            {formatBaht(data?.kpis.todayRevenue || 0)}{' '}
            <span className="text-[13px] font-normal text-[#64756E]">฿</span>
          </div>
          <div className="text-[12px] text-[#52645D] mt-1 tabular-nums">
            ผ่าน {data?.kpis.todayVerifiedCount ?? 0} ใบ · แจ้งเตือน {data?.kpis.todayAlertCount ?? 0} ใบ
          </div>
        </div>

        <div className="ledger-surface rounded-[14px] p-4">
          <div className="text-[12.5px] text-[#64756E]">ยอดโอนยืนยันรวมทุกร้าน (เดือนนี้)</div>
          <div className="text-[26px] font-bold tabular-nums text-[#10201A] mt-1">
            {formatBaht(data?.kpis.monthRevenue || 0)}{' '}
            <span className="text-[13px] font-normal text-[#64756E]">฿</span>
          </div>
          <div className="text-[12px] text-[#52645D] mt-1 tabular-nums">
            สลิปผ่านเดือนนี้ {data?.kpis.monthVerifiedCount ?? 0} ใบ
          </div>
        </div>

        <div className="ledger-surface rounded-[14px] p-4">
          <div className="text-[12.5px] text-[#64756E]">ยอดสะสมทั้งแพลตฟอร์ม</div>
          <div className="text-[26px] font-bold tabular-nums text-[#10201A] mt-1">
            {formatBaht(data?.kpis.allTimeRevenue || 0)}{' '}
            <span className="text-[13px] font-normal text-[#64756E]">฿</span>
          </div>
          <div className="text-[12px] text-[#52645D] mt-1 tabular-nums">
            ตรวจสลิปสะสมทั้งหมด {data?.kpis.allTimeTotalCount ?? 0} ใบ
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[12px] bg-[#E8ECEA] p-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('shops')}
            className={`btn-press px-4 py-2 rounded-[8px] text-[13.5px] font-semibold inline-flex items-center gap-2 cursor-pointer ${
              tab === 'shops' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
            }`}
          >
            <Store className="w-4 h-4 text-[#0D6B4E]" />
            ร้านค้าทั้งหมด ({data?.shops.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`btn-press px-4 py-2 rounded-[8px] text-[13.5px] font-semibold inline-flex items-center gap-2 cursor-pointer ${
              tab === 'users' ? 'bg-white text-[#10201A] shadow-xs' : 'text-[#52645D]'
            }`}
          >
            <Users className="w-4 h-4 text-[#0D6B4E]" />
            บัญชีผู้ใช้งาน ({data?.users.length || 0})
          </button>
        </div>

        <div className="relative w-full sm:w-[320px]">
          <Search className="w-4 h-4 text-[#64756E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อร้าน, รหัสร้าน, ชื่อผู้ใช้..."
            className="input-field !pl-9 !text-[13.5px]"
          />
        </div>
      </div>

      {/* TAB 1: ALL SHOPS TABLE */}
      {tab === 'shops' && (
        <section className="ledger-surface rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D] text-[12.5px]">
                  <th className="py-3 px-4 font-semibold">ร้านค้า / Webhook Slug</th>
                  <th className="py-3 px-4 font-semibold">เจ้าของร้าน</th>
                  <th className="py-3 px-4 font-semibold">การเชื่อมต่อ</th>
                  <th className="py-3 px-4 font-semibold text-right">รายรับวันนี้</th>
                  <th className="py-3 px-4 font-semibold text-right">รายรับสะสม</th>
                  <th className="py-3 px-4 font-semibold">สถานะ</th>
                  <th className="py-3 px-4 font-semibold text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F0]">
                {filteredShops.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#64756E]">
                      ไม่พบร้านค้าในระบบ
                    </td>
                  </tr>
                ) : (
                  filteredShops.map((shop) => (
                    <tr key={shop.id} className="row-interactive">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#10201A]">{shop.name}</div>
                        <div className="text-[11.5px] font-mono-code text-[#64756E]">
                          #{shop.id} · {shop.webhookSlug}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-[#10201A]">@{shop.ownerUsername}</div>
                        <div className="text-[11.5px] text-[#64756E]">{shop.ownerDisplayName}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              shop.hasLineConfigured
                                ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                                : 'bg-[#EEF1F0] text-[#64756E]'
                            }`}
                          >
                            LINE {shop.hasLineConfigured ? '✓' : '-'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold ${
                              shop.hasFbConfigured
                                ? 'bg-[#E5F2FF] text-[#0064C8]'
                                : 'bg-[#EEF1F0] text-[#64756E]'
                            }`}
                          >
                            FB {shop.hasFbConfigured ? '✓' : '-'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#F4F6F5] text-[#42544D] font-medium">
                            บัญชีรับเงิน {shop.bankAccountCount}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums font-semibold text-[#0D6B4E]">
                        {formatBaht(shop.todayRevenue)} ฿
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums">
                        <div className="font-bold text-[#10201A]">{formatBaht(shop.allTimeRevenue)} ฿</div>
                        <div className="text-[11.5px] text-[#64756E]">
                          ผ่าน {shop.verifiedCount} · แจ้งเตือน {shop.alertCount}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                            shop.isActive
                              ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                              : 'bg-[#FDECEC] text-[#C82829]'
                          }`}
                        >
                          {shop.isActive ? 'เปิดใช้งาน' : 'ระงับชั่วคราว'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectShop(shop.id)}
                            className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold text-[#0D6B4E] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            เข้าจัดการร้าน
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleShopActive(shop)}
                            className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium cursor-pointer"
                          >
                            {shop.isActive ? 'ระงับ' : 'เปิดใช้'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteShop(shop)}
                            className="btn-press p-1.5 rounded-[8px] text-[#64756E] hover:text-[#C82829] hover:bg-[#FDECEC] cursor-pointer"
                            aria-label="ลบร้านค้า"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: ALL USERS TABLE */}
      {tab === 'users' && (
        <section className="ledger-surface rounded-[16px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D] text-[12.5px]">
                  <th className="py-3 px-4 font-semibold">ชื่อผู้ใช้งาน (Username)</th>
                  <th className="py-3 px-4 font-semibold">สิทธิ์การใช้งาน</th>
                  <th className="py-3 px-4 font-semibold">จำนวนร้านค้า</th>
                  <th className="py-3 px-4 font-semibold">วันที่สมัคร</th>
                  <th className="py-3 px-4 font-semibold">สถานะบัญชี</th>
                  <th className="py-3 px-4 font-semibold text-right">จัดการบัญชี</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F0]">
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="row-interactive">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#10201A]">
                          @{u.username}{' '}
                          {isSelf && (
                            <span className="text-[11px] text-[#0D6B4E] font-normal">(คุณ)</span>
                          )}
                        </div>
                        <div className="text-[12px] text-[#64756E]">{u.displayName}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                            u.role === 'ADMIN'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-[#F4F6F5] text-[#42544D]'
                          }`}
                        >
                          {u.role === 'ADMIN' ? <Crown className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap tabular-nums">
                        {u.shopCount} ร้าน
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap tabular-nums text-[#52645D]">
                        {formatRecordedTime(u.createdAt).main}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                            u.isActive
                              ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                              : 'bg-[#FDECEC] text-[#C82829]'
                          }`}
                        >
                          {u.isActive ? 'ปกติ' : 'ถูกระงับ'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPasswordInput('');
                              setResetErr('');
                            }}
                            className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            รีเซ็ตรหัสผ่าน
                          </button>
                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleToggleUserRole(u)}
                                className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium cursor-pointer"
                              >
                                {u.role === 'ADMIN' ? 'ปรับเป็น Seller' : 'ตั้งเป็น Admin'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleUserActive(u)}
                                className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                {u.isActive ? 'ระงับ' : 'ปลดระงับ'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteUser(u)}
                                className="btn-press p-1.5 rounded-[8px] text-[#64756E] hover:text-[#C82829] hover:bg-[#FDECEC] cursor-pointer"
                                aria-label="ลบบัญชีผู้ใช้"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Create New User & Shop */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#10201A]/40">
          <form
            onSubmit={handleCreateUser}
            className="overlay-scroll w-full max-w-[420px] rounded-[16px] bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-[#10201A]">สร้างบัญชีร้านค้า / แอดมินใหม่</h2>
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="btn-press p-1 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">ชื่อร้านค้า *</label>
              <input
                type="text"
                required
                value={newShopName}
                onChange={(e) => setNewShopName(e.target.value)}
                placeholder="เช่น ร้านอาหารทะเลสด"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                ชื่อผู้ใช้งานสำหรับล็อกอิน (Username) *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="เช่น seafood_shop"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                รหัสผ่านเริ่มต้น (อย่างน้อย 6 ตัวอักษร) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">ระดับสิทธิ์</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'SELLER' | 'ADMIN')}
                className="input-field"
              >
                <option value="SELLER">SELLER (เจ้าของร้านค้าทั่วไป ดูได้เฉพาะร้านตัวเอง)</option>
                <option value="ADMIN">ADMIN (ผู้ดูแลระบบรวม ดูและจัดการได้ทุกร้าน)</option>
              </select>
            </div>

            {createErr && (
              <div className="text-[13px] text-[#C82829] bg-[#FDECEC] px-3 py-2 rounded-[8px]">
                {createErr}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="btn-press btn-secondary px-4 py-2 rounded-[10px] text-[13.5px] font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {creating ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Reset User Password */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#10201A]/40">
          <form
            onSubmit={handleResetPassword}
            className="overlay-scroll w-full max-w-[390px] rounded-[16px] bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-[#10201A]">
                รีเซ็ตรหัสผ่าน @{resetTarget.username}
              </h2>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="btn-press p-1 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={resetPasswordInput}
                onChange={(e) => setResetPasswordInput(e.target.value)}
                placeholder="กรอกรหัสผ่านใหม่"
                className="input-field"
              />
            </div>

            {resetErr && (
              <div className="text-[13px] text-[#C82829] bg-[#FDECEC] px-3 py-2 rounded-[8px]">
                {resetErr}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="btn-press btn-secondary px-4 py-2 rounded-[10px] text-[13.5px] font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={resetSaving}
                className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {resetSaving ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
