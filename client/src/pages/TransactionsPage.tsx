import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Search, RefreshCw, X } from 'lucide-react';
import type { CategoryItem, Transaction } from '../types';
import { api } from '../lib/api';
import { CHANNEL_META, formatBaht, formatRecordedTime, STATUS_META } from '../lib/format';

interface TransactionsPageProps {
  categories: CategoryItem[];
  initialStatusFilter?: string;
  refreshSignal: number;
  onInspectTransaction: (tx: Transaction) => void;
  onManualCreated: (tx: Transaction) => void;
}

export function TransactionsPage({
  categories,
  initialStatusFilter = 'ALL',
  refreshSignal,
  onInspectTransaction,
  onManualCreated,
}: TransactionsPageProps) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState(initialStatusFilter);
  const [channel, setChannel] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Manual entry modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualCustomer, setManualCustomer] = useState('');
  const [manualCategory, setManualCategory] = useState(categories[0]?.name || 'ขายสินค้า');
  const [manualBank, setManualBank] = useState('เงินสด / โอนหน้าร้าน');
  const [manualNote, setManualNote] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualErr, setManualErr] = useState('');

  useEffect(() => {
    setStatus(initialStatusFilter);
  }, [initialStatusFilter]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTransactions({
        status,
        channel,
        category,
        search,
        dateFrom,
        dateTo,
        limit: 200,
      });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [status, channel, category, search, dateFrom, dateTo]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshSignal]);

  const filteredVerifiedSum = items
    .filter((i) => i.status === 'VERIFIED')
    .reduce((acc, i) => acc + i.amount, 0);

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(manualAmount);
    if (!Number.isFinite(num) || num <= 0) {
      setManualErr('กรุณากรอกยอดเงินที่มากกว่า 0');
      return;
    }
    setManualSaving(true);
    setManualErr('');
    try {
      const res = await api.createManualTransaction({
        amount: num,
        customerName: manualCustomer,
        category: manualCategory,
        sendingBankName: manualBank,
        orderNote: manualNote,
      });
      onManualCreated(res.transaction);
      setShowManualModal(false);
      setManualAmount('');
      setManualCustomer('');
      setManualNote('');
      void loadList();
    } catch (err) {
      setManualErr(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setManualSaving(false);
    }
  }

  const exportUrl = api.getCsvExportUrl({ status, channel, category, search, dateFrom, dateTo });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#10201A]">สมุดรายการสลิปและรายรับ</h1>
          <p className="text-[13.5px] text-[#52645D] mt-0.5">
            ค้นหา กรองรายการ ตรวจสอบสลิปที่มีปัญหา และส่งออกไฟล์ CSV เพื่อทำบัญชี
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="btn-press btn-primary px-3.5 py-2 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            เพิ่มรายรับเอง
          </button>
          <a
            href={exportUrl}
            className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            ส่งออก CSV
          </a>
        </div>
      </div>

      {/* Filters Card */}
      <section className="ledger-surface rounded-[16px] p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-[#64756E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขอ้างอิง, ชื่อลูกค้า, หมายเหตุ, ธนาคาร..."
              className="input-field !pl-9 !text-[13.5px]"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-field !text-[13.5px]"
              aria-label="กรองตามสถานะ"
            >
              <option value="ALL">ทุกสถานะ</option>
              <option value="VERIFIED">ยืนยันแล้ว</option>
              <option value="ALERT">แจ้งเตือนทั้งหมด</option>
              <option value="DUPLICATE">สลิปซ้ำ</option>
              <option value="WRONG_ACCOUNT">ผิดบัญชีร้าน</option>
              <option value="NEEDS_REVIEW">รอตรวจยอด</option>
              <option value="INVALID">ไม่ผ่าน</option>
              <option value="VOIDED">ยกเลิก</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="input-field !text-[13.5px]"
              aria-label="กรองตามช่องทาง"
            >
              <option value="ALL">ทุกช่องทาง</option>
              <option value="LINE_BOT">LINE OA Bot</option>
              <option value="FB_MESSENGER">Facebook Messenger</option>
              <option value="CHROME_EXT">LINE Chat Plug-in</option>
              <option value="FB_CHROME_EXT">FB Inbox Plug-in</option>
              <option value="DASHBOARD">ตรวจบนเว็บ</option>
              <option value="LINE_SIMULATOR">จำลอง LINE</option>
              <option value="FB_SIMULATOR">จำลอง Facebook</option>
              <option value="MANUAL">บันทึกเอง</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field !text-[13.5px]"
              aria-label="กรองตามหมวดหมู่"
            >
              <option value="ALL">ทุกหมวดหมู่</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => void loadList()}
              className="btn-press btn-secondary w-full py-2 px-3 rounded-[10px] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#EEF2F0] text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#64756E]">ช่วงวันที่:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field !w-auto !py-1.5 !text-[12.5px]"
            />
            <span className="text-[#64756E]">ถึง</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field !w-auto !py-1.5 !text-[12.5px]"
            />
            {(dateFrom || dateTo || status !== 'ALL' || channel !== 'ALL' || category !== 'ALL' || search) && (
              <button
                type="button"
                onClick={() => {
                  setStatus('ALL');
                  setChannel('ALL');
                  setCategory('ALL');
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-[12.5px] text-[#0D6B4E] hover:underline cursor-pointer ml-1"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          <div className="tabular-nums text-[#42544D]">
            พบ <span className="font-semibold text-[#10201A]">{total}</span> รายการ · ยอดยืนยันรวม{' '}
            <span className="font-bold text-[#0D6B4E]">{formatBaht(filteredVerifiedSum)} บาท</span>
          </div>
        </div>
      </section>

      {/* Full Table */}
      <section className="ledger-surface rounded-[16px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D] text-[12.5px]">
                <th className="py-3 px-4 font-semibold">สถานะ</th>
                <th className="py-3 px-4 font-semibold">เวลาบันทึก</th>
                <th className="py-3 px-4 font-semibold">ช่องทาง</th>
                <th className="py-3 px-4 font-semibold">ลูกค้า / หมายเหตุ</th>
                <th className="py-3 px-4 font-semibold">หมวดหมู่</th>
                <th className="py-3 px-4 font-semibold">ธนาคาร / เลขอ้างอิง</th>
                <th className="py-3 px-4 font-semibold text-right">ยอดเงิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F0]">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64756E]">
                    กำลังโหลดสมุดรายการ...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64756E]">
                    ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                items.map((tx) => {
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
                        <div className="text-[11.5px] text-[#64756E]">{tx.transferDisplay || t.ago}</div>
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
                      <td className="py-3.5 px-4 max-w-[230px]">
                        <div className="font-medium text-[#10201A] truncate">
                          {tx.customerName || '-'}
                        </div>
                        <div className="text-[12px] text-[#64756E] truncate">
                          {tx.orderNote || tx.verificationMessage}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-[8px] bg-[#F4F6F5] text-[#42544D] text-[12px] font-medium">
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-[#10201A]">{tx.sendingBankName || '-'}</div>
                        <div className="text-[11.5px] font-mono-code text-[#64756E] max-w-[190px] truncate">
                          {tx.transRef || '-'}
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

      {/* Manual Income Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#10201A]/40">
          <div className="overlay-scroll w-full max-w-[440px] rounded-[16px] bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-bold text-[#10201A]">บันทึกรายรับด้วยตนเอง</h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="btn-press p-1 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateManual} className="space-y-3.5">
              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  ยอดเงิน (บาท) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="เช่น 450.00"
                  className="input-field tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    ชื่อลูกค้า
                  </label>
                  <input
                    type="text"
                    value={manualCustomer}
                    onChange={(e) => setManualCustomer(e.target.value)}
                    placeholder="ลูกค้าหน้าร้าน"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    หมวดหมู่
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="input-field"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  ช่องทางชำระเงิน
                </label>
                <input
                  type="text"
                  value={manualBank}
                  onChange={(e) => setManualBank(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                  หมายเหตุออเดอร์
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="รายละเอียดสินค้า หรือเลขใบเสร็จ"
                  className="input-field"
                />
              </div>

              {manualErr && (
                <div className="text-[13px] text-[#C82829] bg-[#FDECEC] px-3 py-2 rounded-[8px]">
                  {manualErr}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="btn-press btn-secondary px-4 py-2 rounded-[10px] text-[13.5px] font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={manualSaving}
                  className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  {manualSaving ? 'กำลังบันทึก...' : 'บันทึกรายรับ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
