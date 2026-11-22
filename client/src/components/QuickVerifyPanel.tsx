import { useRef, useState } from 'react';
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, QrCode } from 'lucide-react';
import type { CategoryItem, Transaction } from '../types';
import { api } from '../lib/api';
import { formatBaht, preScanQrFromFile, STATUS_META } from '../lib/format';

interface QuickVerifyPanelProps {
  categories: CategoryItem[];
  onVerified: (tx: Transaction) => void;
  onInspect: (tx: Transaction) => void;
}

export function QuickVerifyPanel({ categories, onVerified, onInspect }: QuickVerifyPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [qrPayload, setQrPayload] = useState('');
  const [qrHint, setQrHint] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [category, setCategory] = useState(categories[0]?.name || 'ขายสินค้า');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handlePickedFile(picked: File | null) {
    setErrorMsg('');
    setLastTx(null);
    setQrPayload('');
    setQrHint('');
    setFile(picked);
    if (!picked) return;

    setQrHint('กำลังสแกน QR บนเบราว์เซอร์...');
    const decoded = await preScanQrFromFile(picked);
    if (decoded) {
      setQrPayload(decoded);
      setQrHint('พบ Mini QR แล้ว พร้อมส่งตรวจความเร็วสูง');
    } else {
      setQrHint('พร้อมส่งรูปให้เซิร์ฟเวอร์สแกน QR & OCR');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErrorMsg('กรุณาเลือกรูปสลิปก่อนกดตรวจสอบ');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (qrPayload) fd.append('qr_payload', qrPayload);
      if (customerName.trim()) fd.append('customerName', customerName.trim());
      if (orderNote.trim()) fd.append('orderNote', orderNote.trim());
      fd.append('category', category);

      const res = await api.verifySlip(fd);
      setLastTx(res.transaction);
      onVerified(res.transaction);
      setFile(null);
      setQrPayload('');
      setQrHint('');
      setOrderNote('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ตรวจสอบสลิปไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ledger-surface rounded-[16px] p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-[15.5px] font-semibold text-[#10201A]">ตรวจสลิปด่วนและลงบัญชี</h2>
          <span className="text-[11.5px] text-[#52645D] bg-[#F4F6F5] px-2 py-0.5 rounded-full">
            my-slip-reader
          </span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0] || null;
            if (dropped) void handlePickedFile(dropped);
          }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-[12px] border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-150 ${
            dragOver
              ? 'border-[#0D6B4E] bg-[#E8F5F0]/60'
              : 'border-[#C9D4CE] bg-[#F8FAF9] hover:border-[#0D6B4E]/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handlePickedFile(e.target.files?.[0] || null)}
          />
          <UploadCloud className="w-6 h-6 mx-auto text-[#0D6B4E] mb-1.5" strokeWidth={1.8} />
          {file ? (
            <div className="text-[13px] font-semibold text-[#10201A] truncate">{file.name}</div>
          ) : (
            <div className="text-[13px] text-[#42544D]">
              ลากรูปสลิปมาวาง หรือ <span className="font-semibold text-[#0D6B4E]">เลือกไฟล์</span>
            </div>
          )}
          {qrHint && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-[#0D6B4E] font-medium">
              <QrCode className="w-3.5 h-3.5" />
              <span>{qrHint}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="ชื่อลูกค้า (ไม่บังคับ)"
            className="input-field !py-2 !text-[13px]"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field !py-2 !text-[13px]"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={orderNote}
          onChange={(e) => setOrderNote(e.target.value)}
          placeholder="หมายเหตุออเดอร์ เช่น #ORD-105"
          className="input-field !py-2 !text-[13px] mt-2.5"
        />
      </div>

      <div className="mt-3.5 space-y-2.5">
        <button
          type="submit"
          disabled={loading || !file}
          className="btn-press btn-primary w-full py-2.5 px-4 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังตรวจสลิป...
            </>
          ) : (
            'ตรวจสอบและบันทึกรายรับ'
          )}
        </button>

        {errorMsg && (
          <div className="rounded-[10px] bg-[#FDECEC] text-[#C82829] px-3 py-2 text-[12.5px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {lastTx && (
          <div
            onClick={() => onInspect(lastTx)}
            className={`rounded-[10px] px-3 py-2.5 text-[12.5px] cursor-pointer flex items-center justify-between gap-2 ${
              lastTx.status === 'VERIFIED'
                ? 'bg-[#E8F5F0] text-[#0D6B4E]'
                : 'bg-[#FDECEC] text-[#C82829]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {lastTx.status === 'VERIFIED' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate font-semibold">
                {STATUS_META[lastTx.status].label}: {formatBaht(lastTx.amount)} บาท
              </span>
            </div>
            <span className="underline shrink-0 font-medium">ดูรายละเอียด</span>
          </div>
        )}
      </div>
    </form>
  );
}
