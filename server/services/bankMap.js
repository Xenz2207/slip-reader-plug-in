export const THAI_BANKS = {
  '002': { code: '002', short: 'BBL', th: 'ธนาคารกรุงเทพ', en: 'Bangkok Bank', color: '#1E4598' },
  '004': { code: '004', short: 'KBANK', th: 'ธนาคารกสิกรไทย', en: 'Kasikornbank', color: '#138F2D' },
  '006': { code: '006', short: 'KTB', th: 'ธนาคารกรุงไทย', en: 'Krungthai Bank', color: '#1BA5E0' },
  '011': { code: '011', short: 'TTB', th: 'ธนาคารทหารไทยธนชาต', en: 'TMBThanachart Bank', color: '#0050F0' },
  '014': { code: '014', short: 'SCB', th: 'ธนาคารไทยพาณิชย์', en: 'Siam Commercial Bank', color: '#4E2A84' },
  '022': { code: '022', short: 'CIMB', th: 'ธนาคารซีไอเอ็มบี ไทย', en: 'CIMB Thai', color: '#7E1416' },
  '024': { code: '024', short: 'UOB', th: 'ธนาคารยูโอบี', en: 'UOB Thailand', color: '#0B3979' },
  '025': { code: '025', short: 'BAY', th: 'ธนาคารกรุงศรีอยุธยา', en: 'Bank of Ayudhya (Krungsri)', color: '#FEC43B' },
  '030': { code: '030', short: 'GSB', th: 'ธนาคารออมสิน', en: 'Government Savings Bank', color: '#EB198D' },
  '033': { code: '033', short: 'GHB', th: 'ธนาคารอาคารสงเคราะห์', en: 'GH Bank', color: '#F58220' },
  '034': { code: '034', short: 'BAAC', th: 'ธ.ก.ส.', en: 'BAAC', color: '#1A7A3E' },
  '066': { code: '066', short: 'IBANK', th: 'ธนาคารอิสลามฯ', en: 'Islamic Bank of Thailand', color: '#186E43' },
  '067': { code: '067', short: 'TISCO', th: 'ธนาคารทิสโก้', en: 'TISCO Bank', color: '#12549F' },
  '069': { code: '069', short: 'KKP', th: 'ธนาคารเกียรตินาคินภัทร', en: 'Kiatnakin Phatra Bank', color: '#594F9F' },
  '073': { code: '073', short: 'LHB', th: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', en: 'LH Bank', color: '#6D6E71' },
  PROMPTPAY: { code: 'PROMPTPAY', short: 'PP', th: 'พร้อมเพย์', en: 'PromptPay', color: '#113F83' },
};

export function resolveBankLabel(bankCode, bankEng) {
  const code = String(bankCode || '').trim().padStart(3, '0');
  if (THAI_BANKS[code]) {
    return THAI_BANKS[code].th;
  }
  if (bankCode && THAI_BANKS[String(bankCode).toUpperCase()]) {
    return THAI_BANKS[String(bankCode).toUpperCase()].th;
  }
  if (bankEng) {
    const low = String(bankEng).toLowerCase();
    for (const item of Object.values(THAI_BANKS)) {
      if (low.includes(item.short.toLowerCase()) || low.includes(item.en.toLowerCase())) {
        return item.th;
      }
    }
    return String(bankEng);
  }
  return 'ไม่ระบุธนาคาร';
}

export function getBangkokIsoNow(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.format(date).replace(' ', 'T');
  return `${parts}+07:00`;
}

export function getBangkokDateKey(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return getBangkokDateKey(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatBaht(amount) {
  return Number(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
