-- SlipFlow Cloudflare D1 Schema (SQLite)

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL DEFAULT '004',
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'BANK',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#0D6B4E',
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trans_ref TEXT,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  sending_bank_code TEXT DEFAULT '',
  sending_bank_name TEXT DEFAULT '',
  sender_account TEXT DEFAULT '',
  receiver_account TEXT DEFAULT '',
  matched_seller_account_id INTEGER,
  matched_seller_account_label TEXT DEFAULT '',
  transfer_display TEXT DEFAULT '',
  transfer_iso TEXT DEFAULT '',
  recorded_at TEXT NOT NULL,
  recorded_date TEXT NOT NULL,
  customer_name TEXT DEFAULT '',
  customer_line_id TEXT DEFAULT '',
  line_source_type TEXT DEFAULT '',
  line_source_id TEXT DEFAULT '',
  line_message_id TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'ขายสินค้า',
  order_note TEXT DEFAULT '',
  verification_message TEXT DEFAULT '',
  error_code TEXT DEFAULT '',
  crc_hex TEXT DEFAULT '',
  processing_ms INTEGER DEFAULT 0,
  raw_qr_payload TEXT DEFAULT '',
  tlv_breakdown_json TEXT DEFAULT '[]',
  ocr_lines_json TEXT DEFAULT '[]',
  checks_json TEXT DEFAULT '{}',
  raw_api_response_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_transactions_trans_ref ON transactions(trans_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_recorded_date ON transactions(recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_channel ON transactions(channel);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  source_type TEXT DEFAULT '',
  source_id TEXT DEFAULT '',
  user_id TEXT DEFAULT '',
  customer_name TEXT DEFAULT '',
  message_id TEXT DEFAULT '',
  outcome TEXT NOT NULL,
  detail TEXT DEFAULT '',
  transaction_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

INSERT OR IGNORE INTO categories (name, color, is_default) VALUES
  ('ขายสินค้า', '#0D6B4E', 1),
  ('มัดจำออเดอร์', '#0284C7', 0),
  ('ค่าจัดส่ง', '#7C3AED', 0),
  ('โอนชำระหน้าร้าน', '#D97706', 0),
  ('รายรับอื่นๆ', '#475569', 0);
