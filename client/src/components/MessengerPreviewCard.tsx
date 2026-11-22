import { formatBaht } from '../lib/format';
import type { TransactionStatus } from '../types';

interface MessengerPreviewCardProps {
  shopName: string;
  greeting: string;
  status?: TransactionStatus;
  amount?: number;
  bankName?: string;
  transferDisplay?: string;
  receiverAccount?: string;
  transRef?: string;
  customerName?: string;
  replyTextOverride?: string;
}

export function MessengerPreviewCard({
  shopName,
  greeting,
  status = 'VERIFIED',
  amount = 1250,
  bankName = 'ธนาคารกสิกรไทย',
  transferDisplay = '22 พ.ย. 69 14:25',
  receiverAccount = 'xxx-x-x5678-x',
  transRef = '016323115453APM13766',
  customerName = 'คุณลูกค้า Facebook',
  replyTextOverride,
}: MessengerPreviewCardProps) {
  const defaultReply =
    replyTextOverride ||
    [
      `✅ [${shopName || 'ร้านค้าของฉัน'}] ยืนยันยอดโอนสำเร็จ`,
      `━━━━━━━━━━━━━━`,
      `ยอดเงิน: ${formatBaht(amount)} บาท`,
      `ธนาคารผู้โอน: ${bankName}`,
      `วันเวลาที่โอน: ${transferDisplay}`,
      `บัญชีปลายทาง: ${receiverAccount}`,
      `เลขอ้างอิง: ${transRef}`,
      `━━━━━━━━━━━━━━`,
      greeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ',
    ].join('\n');

  const isAlert = status !== 'VERIFIED';

  return (
    <div className="rounded-[16px] bg-[#EEF2F7] border border-[#DCE3EC] p-4">
      <div className="text-[11.5px] text-[#42544D] mb-3 flex items-center justify-between">
        <span className="font-semibold">ตัวอย่างข้อความตอบกลับใน Facebook Messenger</span>
        <span className="px-2 py-0.5 rounded-full bg-[#0084FF] text-white text-[11px] font-semibold">
          Messenger
        </span>
      </div>

      <div className="space-y-2.5 max-w-[330px] mx-auto">
        <div className="flex justify-start">
          <div className="rounded-[14px] rounded-bl-[4px] bg-white border border-[#DCE3EC] px-3 py-2 text-[12px] text-[#42544D] shadow-2xs">
            <span className="font-semibold text-[#10201A]">{customerName}</span> ส่งรูปภาพสลิปโอนเงิน
          </div>
        </div>

        <div className="flex justify-end">
          <div
            className={`rounded-[16px] rounded-br-[4px] px-3.5 py-3 text-[12px] leading-relaxed whitespace-pre-wrap shadow-xs ${
              isAlert ? 'bg-[#C82829] text-white' : 'bg-[#0084FF] text-white'
            }`}
          >
            {defaultReply}
          </div>
        </div>
      </div>
    </div>
  );
}
