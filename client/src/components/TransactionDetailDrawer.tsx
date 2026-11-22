import { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Trash2,
  ShieldAlert,
  FileText,
  QrCode,
} from 'lucide-react';
import type { CategoryItem, Transaction, TransactionStatus } from '../types';
import { CHANNEL_META, formatBaht, formatRecordedTime, STATUS_META } from '../lib/format';
import { api } from '../lib/api';

interface TransactionDetailDrawerProps {
  transaction: Transaction | null;
  categories: CategoryItem[];
  onClose: () => void;
  onUpdated: (tx: Transaction) => void;
  onDeleted: (id: number) => void;
}

export function TransactionDetailDrawer({
  transaction,
  categories,
  onClose,
  onUpdated,
  onDeleted,
}: TransactionDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'qr' | 'ocr'>('details');
  const [amountInput, setAmountInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('ขายสินค้า');
  const [customerInput, setCustomerInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [statusInput, setStatusInput] = useState<TransactionStatus>('VERIFIED');
  const [saving, setSaving] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!transaction) return;
    setAmountInput(String(transaction.amount));
    setCategoryInput(transaction.category || 'ขายสินค้า');
    setCustomerInput(transaction.customerName || '');
    setNoteInput(transaction.orderNote || '');
    setStatusInput(transaction.status);
    setActiveTab('details');
    setErrorMsg('');
  }, [transaction]);

  useEffect(() => {
    if (!transaction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [transaction, onClose]);

  if (!transaction) return null;

  const statusMeta = STATUS_META[transaction.status];
  const channelMeta = CHANNEL_META[transaction.channel];
  const recorded = formatRecordedTime(transaction.recordedAt);

  async function handleSave(overrideStatus?: TransactionStatus) {
    if (!transaction) return;
    const numericAmount = Number(amountInput);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setErrorMsg('กรุณากรอกยอดเงินเป็นตัวเลขที่ถูกต้อง');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const nextStatus = overrideStatus || statusInput;
      const res = await api.updateTransaction(transaction.id, {
        status: nextStatus,
        amount: numericAmount,
        category: categoryInput,
        customerName: customerInput,
        orderNote: noteInput,
        verificationMessage:
          overrideStatus === 'VERIFIED'
            ? 'ผู้ขายตรวจสอบและอนุมัติเป็นรายรับแล้ว'
            : overrideStatus === 'VOIDED'
              ? 'ผู้ขายยกเลิกรายการนี้'
              : transaction.verificationMessage,
      });
      onUpdated(res.transaction);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!transaction) return;
    if (!window.confirm(`ต้องการลบรายการ #${transaction.id} ออกจากระบบถาวรหรือไม่?`)) return;
    setSaving(true);
    try {
      await api.deleteTransaction(transaction.id);
      onDeleted(transaction.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ลบรายการไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyRef() {
    if (!transaction?.transRef) return;
    navigator.clipboard.writeText(transaction.transRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 1500);
  }

  const checkEntries = Object.entries(transaction.checks || {});
  const checkLabels: Record<string, string> = {
    qrAndCrc: 'QR Code และค่า CRC',
    notDuplicate: 'ตรวจสอบสลิปซ้ำ',
    receiverAccount: 'บัญชีปลายทางของร้านค้า',
    validAmount: 'ความถูกต้องของยอดเงิน',
    manualEntry: 'การบันทึกรายรับด้วยตนเอง',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#10201A]/35 backdrop-blur-[1px]">
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
      <aside
        className="animate-drawer-in overlay-scroll w-full max-w-[540px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดรายการ #${transaction.id}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#E3E8E5] px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[15px] font-semibold text-[#10201A]">รายการ #{transaction.id}</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${statusMeta.bg} ${statusMeta.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
              {statusMeta.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press p-1.5 rounded-[8px] text-[#52645D] hover:bg-[#F4F6F5] cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Hero */}
        <div className="px-6 py-5 bg-[#F8FAF9] border-b border-[#E3E8E5]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[12.5px] text-[#52645D]">จำนวนเงินบนสลิป</div>
              <div className="text-[32px] font-bold tabular-nums text-[#10201A] leading-tight mt-0.5">
                {formatBaht(transaction.amount)}{' '}
                <span className="text-[15px] font-medium text-[#52645D]">บาท</span>
              </div>
            </div>
            <div className="text-right text-[12.5px] text-[#52645D]">
              <div>ช่องทาง: {channelMeta.label}</div>
              <div>บันทึกเมื่อ {recorded.main}</div>
              {transaction.processingMs > 0 && (
                <div className="tabular-nums text-[#64756E]">
                  เวลาตรวจ {(transaction.processingMs / 1000).toFixed(2)} วินาที
                </div>
              )}
            </div>
          </div>

          {transaction.verificationMessage && (
            <div
              className={`mt-3.5 px-3.5 py-2.5 rounded-[10px] text-[13px] flex items-start gap-2 ${
                transaction.status === 'VERIFIED'
                  ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                  : transaction.status === 'NEEDS_REVIEW'
                    ? 'bg-[#FEF4E6] text-[#B45309]'
                    : 'bg-[#FDECEC] text-[#C82829]'
              }`}
            >
              {transaction.status === 'VERIFIED' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{transaction.verificationMessage}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-[#E3E8E5] flex items-center gap-1">
          {[
            { id: 'details', label: 'ข้อมูลและการแก้ไข', icon: FileText },
            { id: 'qr', label: `ข้อมูล QR (${transaction.tlvBreakdown.length})`, icon: QrCode },
            { id: 'ocr', label: `ข้อความ OCR (${transaction.ocrLines.length})`, icon: ShieldAlert },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-2.5 text-[13px] font-medium border-b-2 cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-120 ${
                  isActive
                    ? 'border-[#0D6B4E] text-[#0D6B4E]'
                    : 'border-transparent text-[#52645D] hover:text-[#10201A]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 flex-1">
          {activeTab === 'details' && (
            <>
              {/* Verification Checks */}
              {checkEntries.length > 0 && (
                <div>
                  <h3 className="text-[13.5px] font-semibold text-[#10201A] mb-2.5">
                    ผลการตรวจสอบอัตโนมัติ
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {checkEntries.map(([key, chk]) => (
                      <div
                        key={key}
                        className="rounded-[10px] border border-[#E3E8E5] bg-[#FAFBFB] p-3 flex items-start gap-2.5"
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold ${
                            chk.passed
                              ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                              : 'bg-[#FDECEC] text-[#C82829]'
                          }`}
                        >
                          {chk.passed ? '✓' : '!'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-[#10201A]">
                            {checkLabels[key] || key}
                          </div>
                          <div className="text-[11.5px] text-[#52645D] mt-0.5 break-words">
                            {chk.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bank & Ref Info */}
              <div className="rounded-[12px] border border-[#E3E8E5] divide-y divide-[#EEF2F0] text-[13.5px]">
                <div className="grid grid-cols-2 gap-3 p-3.5">
                  <div>
                    <div className="text-[12px] text-[#64756E]">ธนาคารผู้โอน</div>
                    <div className="font-semibold text-[#10201A] mt-0.5">
                      {transaction.sendingBankName || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#64756E]">วันเวลาบนสลิป</div>
                    <div className="font-semibold text-[#10201A] mt-0.5 tabular-nums">
                      {transaction.transferDisplay || '-'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3.5">
                  <div>
                    <div className="text-[12px] text-[#64756E]">บัญชีผู้โอน</div>
                    <div className="font-mono-code text-[13px] text-[#10201A] mt-0.5">
                      {transaction.senderAccount || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[#64756E]">บัญชีปลายทาง</div>
                    <div className="font-mono-code text-[13px] text-[#10201A] mt-0.5">
                      {transaction.receiverAccount || '-'}
                    </div>
                    {transaction.matchedSellerAccountLabel && (
                      <div className="text-[11.5px] text-[#0D6B4E] mt-0.5">
                        ตรงกับ: {transaction.matchedSellerAccountLabel}
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] text-[#64756E]">เลขอ้างอิงรายการ (transRef)</div>
                    <div className="font-mono-code text-[13px] font-semibold text-[#10201A] break-all mt-0.5">
                      {transaction.transRef || '-'}
                    </div>
                  </div>
                  {transaction.transRef && (
                    <button
                      type="button"
                      onClick={handleCopyRef}
                      className="btn-press btn-secondary px-2.5 py-1.5 rounded-[8px] text-[12px] font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedRef ? <Check className="w-3.5 h-3.5 text-[#0D6B4E]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedRef ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  )}
                </div>
              </div>

              {/* Editable Seller Fields */}
              <div className="space-y-3.5">
                <h3 className="text-[13.5px] font-semibold text-[#10201A]">บันทึกข้อมูลฝั่งผู้ขาย</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                      ยอดเงิน (บาท)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="input-field tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                      สถานะรายการ
                    </label>
                    <select
                      value={statusInput}
                      onChange={(e) => setStatusInput(e.target.value as TransactionStatus)}
                      className="input-field"
                    >
                      <option value="VERIFIED">ยืนยันแล้ว (นับเป็นรายรับ)</option>
                      <option value="NEEDS_REVIEW">รอตรวจยอด</option>
                      <option value="DUPLICATE">สลิปซ้ำ</option>
                      <option value="WRONG_ACCOUNT">ผิดบัญชีร้าน</option>
                      <option value="INVALID">ไม่ผ่าน</option>
                      <option value="VOIDED">ยกเลิก (ไม่นับรายรับ)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                      ชื่อลูกค้า / LINE Display Name
                    </label>
                    <input
                      type="text"
                      value={customerInput}
                      onChange={(e) => setCustomerInput(e.target.value)}
                      placeholder="เช่น คุณสมชาย"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                      หมวดหมู่รายรับ
                    </label>
                    <select
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      className="input-field"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-[#42544D] mb-1">
                    หมายเหตุออเดอร์ / เลขคำสั่งซื้อ
                  </label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="เช่น ออเดอร์ #ORD-204 เสื้อยืดสีขาว 2 ตัว"
                    className="input-field"
                  />
                </div>

                {errorMsg && (
                  <p className="text-[13px] text-[#C82829] bg-[#FDECEC] px-3 py-2 rounded-[8px]">
                    {errorMsg}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="btn-press btn-danger-soft px-3 py-2 rounded-[10px] text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    ลบรายการ
                  </button>

                  <div className="flex items-center gap-2">
                    {transaction.status !== 'VERIFIED' && (
                      <button
                        type="button"
                        onClick={() => handleSave('VERIFIED')}
                        disabled={saving}
                        className="btn-press btn-secondary px-3.5 py-2 rounded-[10px] text-[13px] font-semibold text-[#0D6B4E] cursor-pointer disabled:opacity-50"
                      >
                        อนุมัติเป็นรายรับ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="btn-press btn-primary px-4 py-2 rounded-[10px] text-[13.5px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'qr' && (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-[#F4F6F5] p-3 font-mono-code text-[12px] text-[#10201A] break-all border border-[#E3E8E5]">
                {transaction.rawQrPayload || 'ไม่มีข้อมูล Raw QR Payload'}
              </div>
              {transaction.tlvBreakdown.length > 0 ? (
                <div className="overflow-x-auto border border-[#E3E8E5] rounded-[10px]">
                  <table className="w-full text-left text-[12.5px] border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAF9] border-b border-[#E3E8E5] text-[#52645D]">
                        <th className="py-2 px-3 font-semibold">Tag</th>
                        <th className="py-2 px-3 font-semibold">ยาว</th>
                        <th className="py-2 px-3 font-semibold">ค่า</th>
                        <th className="py-2 px-3 font-semibold">ความหมาย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2F0]">
                      {transaction.tlvBreakdown.map((row, idx) => (
                        <tr key={`${row.tag}-${idx}`}>
                          <td className={`py-2 px-3 font-mono-code ${row.is_sub ? 'pl-6 text-[#64756E]' : ''}`}>
                            {row.tag}
                          </td>
                          <td className="py-2 px-3 font-mono-code tabular-nums">{row.length}</td>
                          <td className="py-2 px-3 font-mono-code break-all">{row.value}</td>
                          <td className="py-2 px-3 text-[#42544D]">{row.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[13px] text-[#64756E] text-center py-8">ไม่มีข้อมูลแยกส่วน TLV</p>
              )}
            </div>
          )}

          {activeTab === 'ocr' && (
            <div>
              <p className="text-[12.5px] text-[#52645D] mb-2">
                ข้อความดิบที่โมเดล OpenThai2.0-OCR-Text อ่านได้จากภาพสลิป
              </p>
              <pre className="rounded-[10px] bg-[#10201A] text-[#E2ECE7] p-4 text-[12.5px] font-mono-code overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {transaction.ocrLines.length > 0
                  ? transaction.ocrLines.join('\n')
                  : 'ไม่มีข้อความ OCR สำหรับรายการนี้'}
              </pre>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
