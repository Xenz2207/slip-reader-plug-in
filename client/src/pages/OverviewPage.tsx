import { ArrowRight, AlertTriangle, CheckCircle2, Building2, MessageSquare } from 'lucide-react';
import type { CategoryItem, DashboardSummary, SellerAccount, Transaction } from '../types';
import { CHANNEL_META, formatBaht, formatRecordedTime, STATUS_META } from '../lib/format';
import { RevenueChart } from '../components/RevenueChart';
import { QuickVerifyPanel } from '../components/QuickVerifyPanel';
import type { NavKey } from '../components/SidebarNav';

interface OverviewPageProps {
  summary: DashboardSummary | null;
  recentTransactions: Transaction[];
  sellerAccounts: SellerAccount[];
  categories: CategoryItem[];
  chartDays: number;
  onChangeChartDays: (days: number) => void;
  onInspectTransaction: (tx: Transaction) => void;
  onVerifiedSlip: (tx: Transaction) => void;
  onNavigate: (page: NavKey, filterAlert?: boolean) => void;
}

export function OverviewPage({
  summary,
  recentTransactions,
  sellerAccounts,
  categories,
  chartDays,
  onChangeChartDays,
  onInspectTransaction,
  onVerifiedSlip,
  onNavigate,
}: OverviewPageProps) {
  const activeAccountsCount = sellerAccounts.filter((a) => a.isActive).length;
  const totalAlertsAllTime =
    (summary?.allTime.duplicateCount || 0) +
    (summary?.allTime.wrongAccountCount || 0) +
    (summary?.allTime.reviewCount || 0);

  const maxBankRev = Math.max(1, ...(summary?.byBank.map((b) => b.revenue) || [1]));

  return (
    <div className="space-y-6">
      {/* Setup nudge when seller hasn't registered a receiving bank account yet */}
      {activeAccountsCount === 0 && (
        <div className="rounded-[14px] border border-[#E6C79C] bg-[#FEF9F1] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
            <div className="text-[13.5px]">
              <div className="font-semibold text-[#7C3A06]">
                ยังไม่ได้ลงทะเบียนเลขบัญชีปลายทางของร้านค้า
              </div>
              <div className="text-[#8B4C15] text-[12.5px] mt-0.5">
                เพิ่มเลขบัญชีธนาคารหรือพร้อมเพย์ของร้านเพื่อให้ระบบช่วยตรวจกันสลิปที่โอนผิดบัญชีโดยอัตโนมัติ
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer shrink-0"
          >
            ตั้งค่าบัญชีร้านค้า
          </button>
        </div>
      )}

      {/* Top Asymmetric Hero: Ledger Summary (7 cols) + Quick Verify Dropzone (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <section className="xl:col-span-7 ledger-elevated rounded-[16px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-[15px] font-semibold text-[#42544D]">รายรับยืนยันแล้ววันนี้</h1>
              <span className="text-[12.5px] font-medium text-[#52645D] bg-[#F4F6F5] px-2.5 py-1 rounded-full tabular-nums">
                วันที่ {summary?.todayDate || '-'}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="text-[40px] sm:text-[46px] font-bold tracking-tight tabular-nums text-[#0D6B4E] leading-none">
                {formatBaht(summary?.today.revenue || 0)}
              </span>
              <span className="text-[17px] font-medium text-[#52645D]">บาท</span>
            </div>

            <p className="mt-2.5 text-[13.5px] text-[#52645D]">
              บันทึกอัตโนมัติจากสลิปที่ผ่านการตรวจสอบ QR, CRC และเช็กสลิปซ้ำเรียบร้อยแล้ว
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-[#E3E8E5] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[12.5px] text-[#64756E]">รายรับสะสมเดือนนี้</div>
              <div className="text-[20px] font-bold tabular-nums text-[#10201A] mt-0.5">
                {formatBaht(summary?.month.revenue || 0)}
                <span className="text-[12.5px] font-medium text-[#64756E] ml-1">฿</span>
              </div>
              <div className="text-[12px] text-[#64756E] mt-0.5 tabular-nums">
                {summary?.month.verifiedCount || 0} สลิปผ่าน
              </div>
            </div>

            <div className="sm:border-l sm:border-[#E3E8E5] sm:pl-4">
              <div className="text-[12.5px] text-[#64756E]">สลิปผ่านวันนี้</div>
              <div className="text-[20px] font-bold tabular-nums text-[#10201A] mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#0D6B4E]" />
                <span>{summary?.today.verifiedCount || 0} ใบ</span>
              </div>
              <div className="text-[12px] text-[#64756E] mt-0.5 tabular-nums">
                สะสมทั้งหมด {summary?.allTime.verifiedCount || 0} ใบ
              </div>
            </div>

            <div className="sm:border-l sm:border-[#E3E8E5] sm:pl-4">
              <div className="text-[12.5px] text-[#64756E]">ต้องตรวจสอบ / ซ้ำ</div>
              <button
                type="button"
                onClick={() => onNavigate('transactions', true)}
                className="mt-0.5 text-[20px] font-bold tabular-nums text-[#C82829] flex items-center gap-1.5 cursor-pointer hover:underline"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{totalAlertsAllTime} รายการ</span>
              </button>
              <div className="text-[12px] text-[#64756E] mt-0.5 tabular-nums">
                วันนี้ {summary?.today.alertCount || 0} รายการ
              </div>
            </div>
          </div>
        </section>

        <div className="xl:col-span-5">
          <QuickVerifyPanel
            categories={categories}
            onVerified={onVerifiedSlip}
            onInspect={onInspectTransaction}
          />
        </div>
      </div>

      {/* Chart + Bank/Channel Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8">
          <RevenueChart
            series={summary?.dailySeries || []}
            days={chartDays}
            onChangeDays={onChangeChartDays}
          />
        </div>

        <section className="xl:col-span-4 ledger-surface rounded-[16px] p-5 flex flex-col justify-between gap-5">
          <div>
            <h2 className="text-[16px] font-semibold text-[#10201A]">ยอดรับโอนแยกตามธนาคาร</h2>
            <p className="text-[12.5px] text-[#64756E] mt-0.5">เฉพาะรายการที่ยืนยันแล้วทั้งหมด</p>

            {summary && summary.byBank.length > 0 ? (
              <div className="mt-4 space-y-3">
                {summary.byBank.map((bank) => {
                  const widthPct = Math.max(6, Math.round((bank.revenue / maxBankRev) * 100));
                  return (
                    <div key={bank.label}>
                      <div className="flex items-center justify-between text-[13px] mb-1">
                        <span className="font-medium text-[#10201A] truncate pr-2">{bank.label}</span>
                        <span className="tabular-nums font-semibold text-[#10201A] shrink-0">
                          {formatBaht(bank.revenue)} ฿
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#EEF2F0] overflow-hidden">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className="h-full rounded-full bg-[#0D6B4E]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[13px] text-[#64756E]">
                ยังไม่มีข้อมูลยอดโอนที่ยืนยันแล้ว
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#E3E8E5]">
            <div className="flex items-center justify-between text-[13px] font-semibold text-[#10201A] mb-2.5">
              <span>ช่องทางรับสลิป</span>
              <button
                type="button"
                onClick={() => onNavigate('line-plugin')}
                className="text-[12px] font-medium text-[#0D6B4E] hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                ตั้งค่า LINE / FB
              </button>
            </div>
            <div className="space-y-1.5 text-[12.5px]">
              {(summary?.byChannel || []).length > 0 ? (
                summary!.byChannel.map((ch) => {
                  const meta = CHANNEL_META[ch.channel];
                  return (
                    <div key={ch.channel} className="flex items-center justify-between py-1">
                      <span className="flex items-center gap-2 text-[#42544D]">
                        <span
                          style={{ backgroundColor: meta?.dotColor || '#0D6B4E' }}
                          className="w-2 h-2 rounded-full"
                        />
                        {meta?.label || ch.channel}
                      </span>
                      <span className="tabular-nums font-semibold text-[#10201A]">
                        {ch.verifiedCount} / {ch.totalCount} ใบ
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[#64756E]">รอรับสลิปใบแรกจาก LINE, Facebook หรือหน้าเว็บ</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Live Incoming Ledger Table */}
      <section className="ledger-surface rounded-[16px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E3E8E5] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-[#10201A]">รายการสลิปล่าสุด</h2>
            <p className="text-[12.5px] text-[#64756E] mt-0.5">
              คลิกที่รายการเพื่อดูผลตรวจ QR, ข้อความ OCR หรือแก้ไขหมวดหมู่และหมายเหตุออเดอร์
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('transactions')}
            className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            ดูสมุดรายการทั้งหมด
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D] text-[12.5px]">
                <th className="py-3 px-4 font-semibold">สถานะ</th>
                <th className="py-3 px-4 font-semibold">เวลาบันทึก</th>
                <th className="py-3 px-4 font-semibold">ช่องทาง</th>
                <th className="py-3 px-4 font-semibold">ลูกค้า / หมายเหตุ</th>
                <th className="py-3 px-4 font-semibold">ธนาคาร / บัญชีปลายทาง</th>
                <th className="py-3 px-4 font-semibold text-right">ยอดเงิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F0]">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center text-[#64756E]">
                    ยังไม่มีรายการสลิป ลองลากรูปสลิปมาวางในกล่องด้านบน หรือส่งสลิปผ่าน LINE OA ได้เลย
                  </td>
                </tr>
              ) : (
                recentTransactions.map((tx) => {
                  const st = STATUS_META[tx.status];
                  const ch = CHANNEL_META[tx.channel];
                  const t = formatRecordedTime(tx.recordedAt);
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onInspectTransaction(tx)}
                      className="row-interactive cursor-pointer"
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${st.bg} ${st.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-[#10201A] tabular-nums">{t.main}</div>
                        <div className="text-[11.5px] text-[#64756E]">{t.ago}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#42544D]">
                          <span
                            style={{ backgroundColor: ch?.dotColor || '#64756E' }}
                            className="w-2 h-2 rounded-full"
                          />
                          {ch?.short || tx.channel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <div className="font-medium text-[#10201A] truncate">
                          {tx.customerName || 'ไม่ระบุลูกค้า'}
                        </div>
                        <div className="text-[12px] text-[#64756E] truncate">
                          {tx.orderNote || tx.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-[#10201A]">{tx.sendingBankName || '-'}</div>
                        <div className="text-[11.5px] font-mono-code text-[#64756E]">
                          {tx.receiverAccount || tx.transRef || '-'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums">
                        <span
                          className={`font-bold text-[14.5px] ${
                            tx.status === 'VERIFIED'
                              ? 'text-[#0D6B4E]'
                              : tx.status === 'VOIDED'
                                ? 'text-[#64756E] line-through'
                                : 'text-[#10201A]'
                          }`}
                        >
                          {formatBaht(tx.amount)} ฿
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
