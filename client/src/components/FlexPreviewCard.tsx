import { formatBaht } from '../lib/format';
import type { TransactionStatus } from '../types';

interface FlexPreviewCardProps {
  shopName: string;
  greeting: string;
  status?: TransactionStatus;
  amount?: number;
  bankName?: string;
  transferDisplay?: string;
  receiverAccount?: string;
  transRef?: string;
  customerName?: string;
  footerOverride?: string;
}

export function FlexPreviewCard({
  shopName,
  greeting,
  status = 'VERIFIED',
  amount = 1250,
  bankName = 'ธนาคารกสิกรไทย',
  transferDisplay = '22 พ.ย. 69 14:25',
  receiverAccount = 'xxx-x-x5678-x',
  transRef = '016323115453APM13766',
  customerName = 'คุณลูกค้า',
  footerOverride,
}: FlexPreviewCardProps) {
  const palette: Record<TransactionStatus, { bg: string; title: string; amountColor: string }> = {
    VERIFIED: { bg: '#0D6B4E', title: 'ยืนยันยอดโอนสำเร็จ', amountColor: '#0D6B4E' },
    DUPLICATE: { bg: '#C82829', title: 'ตรวจพบสลิปซ้ำในระบบ', amountColor: '#C82829' },
    WRONG_ACCOUNT: { bg: '#C82829', title: 'บัญชีปลายทางไม่ตรงร้านค้า', amountColor: '#C82829' },
    NEEDS_REVIEW: { bg: '#B45309', title: 'รอผู้ขายตรวจสอบยอดเงิน', amountColor: '#B45309' },
    INVALID: { bg: '#C82829', title: 'ตรวจสอบสลิปไม่ผ่าน', amountColor: '#C82829' },
    VOIDED: { bg: '#52645D', title: 'รายการถูกยกเลิก', amountColor: '#52645D' },
  };
  const cfg = palette[status];

  const rows = [
    { label: 'ผู้ส่งสลิป', value: customerName },
    { label: 'ธนาคารผู้โอน', value: bankName },
    { label: 'วันเวลาที่โอน', value: transferDisplay },
    { label: 'บัญชีปลายทาง', value: receiverAccount },
    { label: 'เลขอ้างอิง', value: transRef },
  ];

  return (
    <div className="rounded-[16px] bg-[#849EBF] p-4">
      <div className="text-[11px] text-white/90 mb-2 flex items-center justify-between">
        <span>ตัวอย่างข้อความตอบกลับ LINE Flex Message</span>
        <span className="px-2 py-0.5 rounded-full bg-black/20">LINE OA</span>
      </div>
      <div className="max-w-[300px] mx-auto rounded-[14px] overflow-hidden bg-white shadow-md">
        <div style={{ backgroundColor: cfg.bg }} className="px-4 py-3.5 text-white">
          <div className="text-[11px] opacity-85 font-medium">{shopName || 'ร้านค้าของฉัน'}</div>
          <div className="text-[16px] font-bold mt-0.5 leading-snug">{cfg.title}</div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[11px] text-[#52645D]">จำนวนเงิน</div>
            <div
              style={{ color: cfg.amountColor }}
              className="text-[24px] font-bold tabular-nums leading-tight mt-0.5"
            >
              {formatBaht(amount)} บาท
            </div>
          </div>
          <div className="border-t border-[#E3E8E5] pt-3 space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-2 text-[11.5px]">
                <span className="text-[#64756E] shrink-0">{r.label}</span>
                <span className="font-semibold text-[#10201A] text-right break-all">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#F4F6F5] px-4 py-2.5 text-[11.5px] text-[#3A4A44] leading-relaxed">
          {footerOverride || greeting}
        </div>
      </div>
    </div>
  );
}
