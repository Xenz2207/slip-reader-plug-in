-- SlipFlow Multi-Shop & Authentication Migration (0002)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  webhook_slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(webhook_slug);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, key)
);

CREATE INDEX IF NOT EXISTS idx_shop_settings_key_val ON shop_settings(key, value);

DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0D6B4E',
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE(shop_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_shop ON categories(shop_id);

ALTER TABLE seller_accounts ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_seller_accounts_shop ON seller_accounts(shop_id);

ALTER TABLE transactions ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_transactions_shop_date ON transactions(shop_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_ref ON transactions(shop_id, trans_ref);

ALTER TABLE webhook_logs ADD COLUMN shop_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_webhook_logs_shop ON webhook_logs(shop_id, id DESC);
