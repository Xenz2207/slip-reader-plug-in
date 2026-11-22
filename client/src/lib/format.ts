import jsQR from 'jsqr';
import type { TransactionChannel, TransactionStatus } from '../types';

const TH_MONTHS_SHORT = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export function formatBaht(amount: number): string {
  return Number(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatShortDay(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = Number(parts[2]);
  const month = Number(parts[1]);
  return `${day} ${TH_MONTHS_SHORT[month] || ''}`;
}

export function formatRecordedTime(isoStr: string): { main: string; ago: string } {
  if (!isoStr) return { main: '-', ago: '' };
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return { main: isoStr, ago: '' };

  const day = d.getDate();
  const month = TH_MONTHS_SHORT[d.getMonth() + 1] || '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  let ago = 'เมื่อสักครู่';
  if (diffSec >= 86400) {
    ago = `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
  } else if (diffSec >= 3600) {
    ago = `${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`;
  } else if (diffSec >= 60) {
    ago = `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  }
  return { main: `${day} ${month} ${hh}:${mm}`, ago };
}

export const STATUS_META: Record<
  TransactionStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  VERIFIED: {
    label: 'ยืนยันแล้ว',
    bg: 'bg-[#E8F5F0]',
    text: 'text-[#0D6B4E]',
    dot: 'bg-[#0D6B4E]',
  },
  DUPLICATE: {
    label: 'สลิปซ้ำ',
    bg: 'bg-[#FDECEC]',
    text: 'text-[#C82829]',
    dot: 'bg-[#C82829]',
  },
  WRONG_ACCOUNT: {
    label: 'ผิดบัญชีร้าน',
    bg: 'bg-[#FDECEC]',
    text: 'text-[#C82829]',
    dot: 'bg-[#C82829]',
  },
  NEEDS_REVIEW: {
    label: 'รอตรวจยอด',
    bg: 'bg-[#FEF4E6]',
    text: 'text-[#B45309]',
    dot: 'bg-[#D97706]',
  },
  INVALID: {
    label: 'ไม่ผ่าน',
    bg: 'bg-[#FDECEC]',
    text: 'text-[#C82829]',
    dot: 'bg-[#C82829]',
  },
  VOIDED: {
    label: 'ยกเลิก',
    bg: 'bg-[#EEF1F0]',
    text: 'text-[#52645D]',
    dot: 'bg-[#86968F]',
  },
};

export const CHANNEL_META: Record<
  TransactionChannel,
  { label: string; short: string; dotColor: string }
> = {
  LINE_BOT: { label: 'LINE OA Bot', short: 'LINE Bot', dotColor: '#06C755' },
  FB_MESSENGER: { label: 'Facebook Messenger', short: 'Messenger', dotColor: '#0084FF' },
  CHROME_EXT: { label: 'LINE Chat Plug-in', short: 'LINE Ext', dotColor: '#06C755' },
  FB_CHROME_EXT: { label: 'FB Inbox Plug-in', short: 'FB Ext', dotColor: '#0084FF' },
  LINE_SIMULATOR: { label: 'จำลอง LINE', short: 'LINE Sim', dotColor: '#06C755' },
  FB_SIMULATOR: { label: 'จำลอง Facebook', short: 'FB Sim', dotColor: '#0084FF' },
  DASHBOARD: { label: 'ตรวจบนเว็บ', short: 'Web', dotColor: '#0D6B4E' },
  MANUAL: { label: 'บันทึกเอง', short: 'Manual', dotColor: '#64756E' },
};

export async function preScanQrFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            resolve('');
            return;
          }
          const scale = Math.min(1, 900 / Math.max(1, img.naturalWidth));
          canvas.width = Math.max(1, Math.floor(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.floor(img.naturalHeight * scale));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = jsQR(imageData.data, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          resolve(decoded?.data || '');
        } catch {
          URL.revokeObjectURL(objectUrl);
          resolve('');
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve('');
      };
      img.src = objectUrl;
    } catch {
      resolve('');
    }
  });
}
