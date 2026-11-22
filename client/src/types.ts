export type TransactionStatus =
  | 'VERIFIED'
  | 'DUPLICATE'
  | 'WRONG_ACCOUNT'
  | 'NEEDS_REVIEW'
  | 'INVALID'
  | 'VOIDED';

export type TransactionChannel =
  | 'LINE_BOT'
  | 'FB_MESSENGER'
  | 'CHROME_EXT'
  | 'FB_CHROME_EXT'
  | 'DASHBOARD'
  | 'LINE_SIMULATOR'
  | 'FB_SIMULATOR'
  | 'MANUAL';

export interface TlvRow {
  tag: string;
  length: number;
  value: string;
  meaning: string;
  is_sub?: boolean;
}

export interface VerificationCheck {
  passed: boolean;
  skipped?: boolean;
  detail: string;
}

export interface Transaction {
  id: number;
  transRef: string;
  status: TransactionStatus;
  channel: TransactionChannel;
  amount: number;
  sendingBankCode: string;
  sendingBankName: string;
  senderAccount: string;
  receiverAccount: string;
  matchedSellerAccountId: number | null;
  matchedSellerAccountLabel: string;
  transferDisplay: string;
  transferIso: string;
  recordedAt: string;
  recordedDate: string;
  customerName: string;
  customerLineId: string;
  lineSourceType: string;
  lineSourceId: string;
  lineMessageId: string;
  category: string;
  orderNote: string;
  verificationMessage: string;
  errorCode: string;
  crcHex: string;
  processingMs: number;
  rawQrPayload: string;
  tlvBreakdown: TlvRow[];
  ocrLines: string[];
  checks: Record<string, VerificationCheck>;
}

export interface DashboardSummary {
  todayDate: string;
  today: {
    revenue: number;
    verifiedCount: number;
    alertCount: number;
    totalCount: number;
  };
  month: {
    monthKey: string;
    revenue: number;
    verifiedCount: number;
    alertCount: number;
  };
  allTime: {
    revenue: number;
    verifiedCount: number;
    duplicateCount: number;
    wrongAccountCount: number;
    reviewCount: number;
    totalCount: number;
  };
  dailySeries: Array<{
    date: string;
    revenue: number;
    verifiedCount: number;
    alertCount: number;
  }>;
  byBank: Array<{ label: string; revenue: number; count: number }>;
  byChannel: Array<{
    channel: TransactionChannel;
    revenue: number;
    verifiedCount: number;
    totalCount: number;
  }>;
  byCategory: Array<{ label: string; revenue: number; count: number }>;
}

export interface SellerAccount {
  id: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  accountType: 'BANK' | 'PROMPTPAY';
  isActive: boolean;
  createdAt: string;
}

export interface CategoryItem {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface ShopInfo {
  id: number;
  ownerUserId: number;
  name: string;
  webhookSlug: string;
  createdAt: string;
}

export interface PublicSettings {
  shopId: number;
  webhookSlug: string;
  shopName: string;
  slipApiBaseUrl: string;
  lineAdminNotifyTargetId: string;
  lineAutoReplyEnabled: boolean;
  lineReplyOnError: boolean;
  lineIgnoreNonSlip: boolean;
  lineNotifyAdminOnVerified: boolean;
  lineNotifyAdminOnAlert: boolean;
  lineReplyGreeting: string;
  fbVerifyToken: string;
  fbAutoReplyEnabled: boolean;
  fbReplyOnError: boolean;
  fbIgnoreNonSlip: boolean;
  fbReplyGreeting: string;
  fbNotifyLineAdmin: boolean;
  hasFbAppSecret: boolean;
  hasFbPageAccessToken: boolean;
  fbAppSecretMasked: string;
  fbPageAccessTokenMasked: string;
  checkReceiverAccount: boolean;
  rejectDuplicateSlip: boolean;
  minAmount: number;
  extensionApiKey: string;
  hasLineChannelSecret: boolean;
  hasLineChannelAccessToken: boolean;
  lineChannelSecretMasked: string;
  lineChannelAccessTokenMasked: string;
}

export interface WebhookLog {
  id: number;
  eventType: string;
  sourceType: string;
  sourceId: string;
  userId: string;
  customerName: string;
  messageId: string;
  outcome: string;
  detail: string;
  transactionId: number | null;
  createdAt: string;
}

export interface RemoteSlipApiHealth {
  online: boolean;
  httpStatus: number;
  baseUrl: string;
  service: string;
  version: string;
  ocrEngine: string;
  latencyMs: number;
  error?: string;
}

export interface ThaiBankOption {
  code: string;
  short: string;
  th: string;
  en: string;
  color: string;
}
