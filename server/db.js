import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { getBangkokDateKey, getBangkokIsoNow } from './services/bankMap.js';

export function createDatabase(dbPath = config.databasePath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
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
  `);

  const now = getBangkokIsoNow();
  const defaultSettings = {
    shop_name: 'ร้านค้าของฉัน',
    slip_api_base_url: config.slipApiBaseUrl,
    line_channel_secret: config.lineChannelSecret || '',
    line_channel_access_token: config.lineChannelAccessToken || '',
    line_admin_notify_target_id: config.lineAdminNotifyTargetId || '',
    line_auto_reply_enabled: 'true',
    line_reply_on_error: 'true',
    line_ignore_non_slip: 'true',
    line_notify_admin_on_verified: 'false',
    line_notify_admin_on_alert: 'true',
    line_reply_greeting: 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ',
    fb_app_secret: config.fbAppSecret || '',
    fb_page_access_token: config.fbPageAccessToken || '',
    fb_verify_token: config.fbVerifyToken || `fbv_${crypto.randomBytes(12).toString('hex')}`,
    fb_auto_reply_enabled: 'true',
    fb_reply_on_error: 'true',
    fb_ignore_non_slip: 'true',
    fb_reply_greeting: 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ',
    fb_notify_line_admin: 'false',
    check_receiver_account: 'true',
    reject_duplicate_slip: 'true',
    min_amount: '0',
    extension_api_key: config.extensionApiKey || `sf_${crypto.randomBytes(18).toString('hex')}`,
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, String(value), now);
  }

  const defaultCategories = [
    ['ขายสินค้า', '#0D6B4E', 1],
    ['มัดจำออเดอร์', '#0284C7', 0],
    ['ค่าจัดส่ง', '#7C3AED', 0],
    ['โอนชำระหน้าร้าน', '#D97706', 0],
    ['รายรับอื่นๆ', '#475569', 0],
  ];
  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (name, color, is_default) VALUES (?, ?, ?)'
  );
  for (const [name, color, isDefault] of defaultCategories) {
    insertCat.run(name, color, isDefault);
  }

  return createRepository(db);
}

function safeParseJson(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    transRef: row.trans_ref || '',
    status: row.status,
    channel: row.channel,
    amount: Number(row.amount || 0),
    sendingBankCode: row.sending_bank_code || '',
    sendingBankName: row.sending_bank_name || '',
    senderAccount: row.sender_account || '',
    receiverAccount: row.receiver_account || '',
    matchedSellerAccountId: row.matched_seller_account_id ?? null,
    matchedSellerAccountLabel: row.matched_seller_account_label || '',
    transferDisplay: row.transfer_display || '',
    transferIso: row.transfer_iso || '',
    recordedAt: row.recorded_at,
    recordedDate: row.recorded_date,
    customerName: row.customer_name || '',
    customerLineId: row.customer_line_id || '',
    lineSourceType: row.line_source_type || '',
    lineSourceId: row.line_source_id || '',
    lineMessageId: row.line_message_id || '',
    category: row.category || 'ขายสินค้า',
    orderNote: row.order_note || '',
    verificationMessage: row.verification_message || '',
    errorCode: row.error_code || '',
    crcHex: row.crc_hex || '',
    processingMs: Number(row.processing_ms || 0),
    rawQrPayload: row.raw_qr_payload || '',
    tlvBreakdown: safeParseJson(row.tlv_breakdown_json, []),
    ocrLines: safeParseJson(row.ocr_lines_json, []),
    checks: safeParseJson(row.checks_json, {}),
    rawApiResponse: safeParseJson(row.raw_api_response_json, {}),
  };
}

function createRepository(db) {
  return {
    raw: db,

    close() {
      db.close();
    },

    getSettings() {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const map = {};
      for (const r of rows) {
        map[r.key] = r.value;
      }
      return {
        shopName: map.shop_name || 'ร้านค้าของฉัน',
        slipApiBaseUrl: (map.slip_api_base_url || config.slipApiBaseUrl).replace(/\/+$/, ''),
        lineChannelSecret: map.line_channel_secret || '',
        lineChannelAccessToken: map.line_channel_access_token || '',
        lineAdminNotifyTargetId: map.line_admin_notify_target_id || '',
        lineAutoReplyEnabled: map.line_auto_reply_enabled !== 'false',
        lineReplyOnError: map.line_reply_on_error !== 'false',
        lineIgnoreNonSlip: map.line_ignore_non_slip !== 'false',
        lineNotifyAdminOnVerified: map.line_notify_admin_on_verified === 'true',
        lineNotifyAdminOnAlert: map.line_notify_admin_on_alert !== 'false',
        lineReplyGreeting: map.line_reply_greeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ',
        fbAppSecret: map.fb_app_secret || '',
        fbPageAccessToken: map.fb_page_access_token || '',
        fbVerifyToken: map.fb_verify_token || '',
        fbAutoReplyEnabled: map.fb_auto_reply_enabled !== 'false',
        fbReplyOnError: map.fb_reply_on_error !== 'false',
        fbIgnoreNonSlip: map.fb_ignore_non_slip !== 'false',
        fbReplyGreeting: map.fb_reply_greeting || 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ',
        fbNotifyLineAdmin: map.fb_notify_line_admin === 'true',
        checkReceiverAccount: map.check_receiver_account !== 'false',
        rejectDuplicateSlip: map.reject_duplicate_slip !== 'false',
        minAmount: Number(map.min_amount || 0),
        extensionApiKey: map.extension_api_key || '',
      };
    },

    getPublicSettings() {
      const s = this.getSettings();
      return {
        ...s,
        hasLineChannelSecret: Boolean(s.lineChannelSecret),
        hasLineChannelAccessToken: Boolean(s.lineChannelAccessToken),
        lineChannelSecretMasked: s.lineChannelSecret
          ? `${s.lineChannelSecret.slice(0, 4)}••••••••${s.lineChannelSecret.slice(-4)}`
          : '',
        lineChannelAccessTokenMasked: s.lineChannelAccessToken
          ? `${s.lineChannelAccessToken.slice(0, 6)}••••••••${s.lineChannelAccessToken.slice(-4)}`
          : '',
        hasFbAppSecret: Boolean(s.fbAppSecret),
        hasFbPageAccessToken: Boolean(s.fbPageAccessToken),
        fbAppSecretMasked: s.fbAppSecret
          ? `${s.fbAppSecret.slice(0, 4)}••••••••${s.fbAppSecret.slice(-4)}`
          : '',
        fbPageAccessTokenMasked: s.fbPageAccessToken
          ? `${s.fbPageAccessToken.slice(0, 6)}••••••••${s.fbPageAccessToken.slice(-4)}`
          : '',
        lineChannelSecret: undefined,
        lineChannelAccessToken: undefined,
        fbAppSecret: undefined,
        fbPageAccessToken: undefined,
      };
    },

    updateSettings(patch) {
      const keyMap = {
        shopName: 'shop_name',
        slipApiBaseUrl: 'slip_api_base_url',
        lineChannelSecret: 'line_channel_secret',
        lineChannelAccessToken: 'line_channel_access_token',
        lineAdminNotifyTargetId: 'line_admin_notify_target_id',
        lineAutoReplyEnabled: 'line_auto_reply_enabled',
        lineReplyOnError: 'line_reply_on_error',
        lineIgnoreNonSlip: 'line_ignore_non_slip',
        lineNotifyAdminOnVerified: 'line_notify_admin_on_verified',
        lineNotifyAdminOnAlert: 'line_notify_admin_on_alert',
        lineReplyGreeting: 'line_reply_greeting',
        fbAppSecret: 'fb_app_secret',
        fbPageAccessToken: 'fb_page_access_token',
        fbVerifyToken: 'fb_verify_token',
        fbAutoReplyEnabled: 'fb_auto_reply_enabled',
        fbReplyOnError: 'fb_reply_on_error',
        fbIgnoreNonSlip: 'fb_ignore_non_slip',
        fbReplyGreeting: 'fb_reply_greeting',
        fbNotifyLineAdmin: 'fb_notify_line_admin',
        checkReceiverAccount: 'check_receiver_account',
        rejectDuplicateSlip: 'reject_duplicate_slip',
        minAmount: 'min_amount',
        extensionApiKey: 'extension_api_key',
      };
      const now = getBangkokIsoNow();
      const stmt = db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      );
      for (const [camel, dbKey] of Object.entries(keyMap)) {
        if (patch[camel] === undefined) continue;
        // Don't overwrite secrets with empty mask placeholders unless explicit clear requested
        if (
          (camel === 'lineChannelSecret' ||
            camel === 'lineChannelAccessToken' ||
            camel === 'fbAppSecret' ||
            camel === 'fbPageAccessToken') &&
          patch[camel] === null
        ) {
          continue;
        }
        let val = patch[camel];
        if (camel === 'slipApiBaseUrl') {
          val = String(val || config.slipApiBaseUrl).trim().replace(/\/+$/, '');
        } else if (typeof val === 'boolean') {
          val = val ? 'true' : 'false';
        } else {
          val = String(val);
        }
        stmt.run(dbKey, val, now);
      }
      return this.getPublicSettings();
    },

    regenerateExtensionApiKey() {
      const nextKey = `sf_${crypto.randomBytes(18).toString('hex')}`;
      this.updateSettings({ extensionApiKey: nextKey });
      return nextKey;
    },

    regenerateFbVerifyToken() {
      const nextToken = `fbv_${crypto.randomBytes(12).toString('hex')}`;
      this.updateSettings({ fbVerifyToken: nextToken });
      return nextToken;
    },

    listSellerAccounts() {
      return db
        .prepare('SELECT * FROM seller_accounts ORDER BY is_active DESC, id DESC')
        .all()
        .map((r) => ({
          id: r.id,
          bankCode: r.bank_code,
          bankName: r.bank_name,
          accountNumber: r.account_number,
          accountName: r.account_name,
          accountType: r.account_type,
          isActive: Boolean(r.is_active),
          createdAt: r.created_at,
        }));
    },

    createSellerAccount({ bankCode, bankName, accountNumber, accountName, accountType = 'BANK' }) {
      const now = getBangkokIsoNow();
      const res = db
        .prepare(
          `INSERT INTO seller_accounts (bank_code, bank_name, account_number, account_name, account_type, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)`
        )
        .run(
          String(bankCode || '004').trim(),
          String(bankName || '').trim(),
          String(accountNumber || '').trim(),
          String(accountName || '').trim(),
          accountType === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK',
          now
        );
      return this.listSellerAccounts().find((a) => a.id === Number(res.lastInsertRowid));
    },

    updateSellerAccount(id, patch) {
      const existing = db.prepare('SELECT * FROM seller_accounts WHERE id = ?').get(Number(id));
      if (!existing) return null;
      db.prepare(
        `UPDATE seller_accounts
         SET bank_code = ?, bank_name = ?, account_number = ?, account_name = ?, account_type = ?, is_active = ?
         WHERE id = ?`
      ).run(
        patch.bankCode !== undefined ? String(patch.bankCode).trim() : existing.bank_code,
        patch.bankName !== undefined ? String(patch.bankName).trim() : existing.bank_name,
        patch.accountNumber !== undefined ? String(patch.accountNumber).trim() : existing.account_number,
        patch.accountName !== undefined ? String(patch.accountName).trim() : existing.account_name,
        patch.accountType !== undefined ? (patch.accountType === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK') : existing.account_type,
        patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.is_active,
        Number(id)
      );
      return this.listSellerAccounts().find((a) => a.id === Number(id));
    },

    deleteSellerAccount(id) {
      const res = db.prepare('DELETE FROM seller_accounts WHERE id = ?').run(Number(id));
      return res.changes > 0;
    },

    listCategories() {
      return db.prepare('SELECT * FROM categories ORDER BY is_default DESC, id ASC').all().map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        isDefault: Boolean(c.is_default),
      }));
    },

    createCategory({ name, color = '#0D6B4E' }) {
      const cleanName = String(name || '').trim();
      const res = db
        .prepare('INSERT INTO categories (name, color, is_default) VALUES (?, ?, 0)')
        .run(cleanName, String(color || '#0D6B4E').trim());
      return { id: Number(res.lastInsertRowid), name: cleanName, color, isDefault: false };
    },

    deleteCategory(id) {
      const res = db.prepare('DELETE FROM categories WHERE id = ? AND is_default = 0').run(Number(id));
      return res.changes > 0;
    },

    findVerifiedByTransRef(transRef) {
      if (!transRef) return null;
      const row = db
        .prepare(
          `SELECT * FROM transactions WHERE trans_ref = ? AND status = 'VERIFIED' ORDER BY id ASC LIMIT 1`
        )
        .get(String(transRef).trim());
      return mapTransaction(row);
    },

    createTransaction(tx) {
      const now = tx.recordedAt || getBangkokIsoNow();
      const dateKey = tx.recordedDate || getBangkokDateKey(now);
      const res = db
        .prepare(
          `INSERT INTO transactions (
            trans_ref, status, channel, amount, sending_bank_code, sending_bank_name,
            sender_account, receiver_account, matched_seller_account_id, matched_seller_account_label,
            transfer_display, transfer_iso, recorded_at, recorded_date,
            customer_name, customer_line_id, line_source_type, line_source_id, line_message_id,
            category, order_note, verification_message, error_code, crc_hex, processing_ms,
            raw_qr_payload, tlv_breakdown_json, ocr_lines_json, checks_json, raw_api_response_json
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )`
        )
        .run(
          tx.transRef || '',
          tx.status || 'VERIFIED',
          tx.channel || 'DASHBOARD',
          Number(tx.amount || 0),
          tx.sendingBankCode || '',
          tx.sendingBankName || '',
          tx.senderAccount || '',
          tx.receiverAccount || '',
          tx.matchedSellerAccountId ?? null,
          tx.matchedSellerAccountLabel || '',
          tx.transferDisplay || '',
          tx.transferIso || '',
          now,
          dateKey,
          tx.customerName || '',
          tx.customerLineId || '',
          tx.lineSourceType || '',
          tx.lineSourceId || '',
          tx.lineMessageId || '',
          tx.category || 'ขายสินค้า',
          tx.orderNote || '',
          tx.verificationMessage || '',
          tx.errorCode || '',
          tx.crcHex || '',
          Number(tx.processingMs || 0),
          tx.rawQrPayload || '',
          JSON.stringify(tx.tlvBreakdown || []),
          JSON.stringify(tx.ocrLines || []),
          JSON.stringify(tx.checks || {}),
          JSON.stringify(tx.rawApiResponse || {})
        );
      return this.getTransactionById(Number(res.lastInsertRowid));
    },

    getTransactionById(id) {
      const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id));
      return mapTransaction(row);
    },

    updateTransaction(id, patch) {
      const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(Number(id));
      if (!existing) return null;
      db.prepare(
        `UPDATE transactions
         SET status = ?, amount = ?, category = ?, order_note = ?, customer_name = ?, verification_message = ?
         WHERE id = ?`
      ).run(
        patch.status !== undefined ? String(patch.status) : existing.status,
        patch.amount !== undefined ? Number(patch.amount) : existing.amount,
        patch.category !== undefined ? String(patch.category) : existing.category,
        patch.orderNote !== undefined ? String(patch.orderNote) : existing.order_note,
        patch.customerName !== undefined ? String(patch.customerName) : existing.customer_name,
        patch.verificationMessage !== undefined ? String(patch.verificationMessage) : existing.verification_message,
        Number(id)
      );
      return this.getTransactionById(Number(id));
    },

    deleteTransaction(id) {
      const res = db.prepare('DELETE FROM transactions WHERE id = ?').run(Number(id));
      return res.changes > 0;
    },

    listTransactions({ status, channel, category, search, dateFrom, dateTo, limit = 100, offset = 0 } = {}) {
      const where = [];
      const params = [];

      if (status && status !== 'ALL') {
        if (status === 'ALERT') {
          where.push(`status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID')`);
        } else {
          where.push('status = ?');
          params.push(status);
        }
      }
      if (channel && channel !== 'ALL') {
        where.push('channel = ?');
        params.push(channel);
      }
      if (category && category !== 'ALL') {
        where.push('category = ?');
        params.push(category);
      }
      if (dateFrom) {
        where.push('recorded_date >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        where.push('recorded_date <= ?');
        params.push(dateTo);
      }
      if (search && search.trim()) {
        const like = `%${search.trim()}%`;
        where.push(
          `(trans_ref LIKE ? OR customer_name LIKE ? OR order_note LIKE ? OR sending_bank_name LIKE ? OR sender_account LIKE ? OR receiver_account LIKE ?)`
        );
        params.push(like, like, like, like, like, like);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM transactions ${whereSql}`).get(...params);
      const rows = db
        .prepare(`SELECT * FROM transactions ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...params, Number(limit), Number(offset));

      return {
        total: Number(totalRow?.count || 0),
        items: rows.map(mapTransaction),
      };
    },

    getDashboardSummary(days = 7) {
      const todayKey = getBangkokDateKey(new Date());
      const monthPrefix = todayKey.slice(0, 7);

      const todayStats = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
             COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count,
             COUNT(*) AS total_count
           FROM transactions WHERE recorded_date = ?`
        )
        .get(todayKey);

      const monthStats = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
             COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count
           FROM transactions WHERE recorded_date LIKE ?`
        )
        .get(`${monthPrefix}%`);

      const allTimeStats = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
             COUNT(CASE WHEN status = 'DUPLICATE' THEN 1 END) AS duplicate_count,
             COUNT(CASE WHEN status = 'WRONG_ACCOUNT' THEN 1 END) AS wrong_account_count,
             COUNT(CASE WHEN status = 'NEEDS_REVIEW' THEN 1 END) AS review_count,
             COUNT(*) AS total_count
           FROM transactions`
        )
        .get();

      // Build exact N-day series in Bangkok date order
      const dayKeys = [];
      const nowMs = Date.now();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(nowMs - i * 86400000);
        dayKeys.push(getBangkokDateKey(d));
      }
      const startDate = dayKeys[0];

      const dailyRows = db
        .prepare(
          `SELECT
             recorded_date AS date,
             COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
             COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count
           FROM transactions
           WHERE recorded_date >= ?
           GROUP BY recorded_date`
        )
        .all(startDate);
      const dailyMap = new Map(dailyRows.map((r) => [r.date, r]));
      const dailySeries = dayKeys.map((date) => {
        const hit = dailyMap.get(date);
        return {
          date,
          revenue: Number(hit?.revenue || 0),
          verifiedCount: Number(hit?.verified_count || 0),
          alertCount: Number(hit?.alert_count || 0),
        };
      });

      const byBank = db
        .prepare(
          `SELECT
             COALESCE(NULLIF(sending_bank_name, ''), 'ไม่ระบุธนาคาร') AS label,
             COALESCE(SUM(amount), 0) AS revenue,
             COUNT(*) AS count
           FROM transactions
           WHERE status = 'VERIFIED'
           GROUP BY label
           ORDER BY revenue DESC
           LIMIT 6`
        )
        .all()
        .map((r) => ({ label: r.label, revenue: Number(r.revenue || 0), count: Number(r.count || 0) }));

      const byChannel = db
        .prepare(
          `SELECT
             channel,
             COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
             COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
             COUNT(*) AS total_count
           FROM transactions
           GROUP BY channel
           ORDER BY total_count DESC`
        )
        .all()
        .map((r) => ({
          channel: r.channel,
          revenue: Number(r.revenue || 0),
          verifiedCount: Number(r.verified_count || 0),
          totalCount: Number(r.total_count || 0),
        }));

      const byCategory = db
        .prepare(
          `SELECT
             category AS label,
             COALESCE(SUM(amount), 0) AS revenue,
             COUNT(*) AS count
           FROM transactions
           WHERE status = 'VERIFIED'
           GROUP BY category
           ORDER BY revenue DESC`
        )
        .all()
        .map((r) => ({ label: r.label, revenue: Number(r.revenue || 0), count: Number(r.count || 0) }));

      return {
        todayDate: todayKey,
        today: {
          revenue: Number(todayStats?.revenue || 0),
          verifiedCount: Number(todayStats?.verified_count || 0),
          alertCount: Number(todayStats?.alert_count || 0),
          totalCount: Number(todayStats?.total_count || 0),
        },
        month: {
          monthKey: monthPrefix,
          revenue: Number(monthStats?.revenue || 0),
          verifiedCount: Number(monthStats?.verified_count || 0),
          alertCount: Number(monthStats?.alert_count || 0),
        },
        allTime: {
          revenue: Number(allTimeStats?.revenue || 0),
          verifiedCount: Number(allTimeStats?.verified_count || 0),
          duplicateCount: Number(allTimeStats?.duplicate_count || 0),
          wrongAccountCount: Number(allTimeStats?.wrong_account_count || 0),
          reviewCount: Number(allTimeStats?.review_count || 0),
          totalCount: Number(allTimeStats?.total_count || 0),
        },
        dailySeries,
        byBank,
        byChannel,
        byCategory,
      };
    },

    logWebhookEvent({ eventType, sourceType = '', sourceId = '', userId = '', customerName = '', messageId = '', outcome, detail = '', transactionId = null }) {
      const now = getBangkokIsoNow();
      const res = db
        .prepare(
          `INSERT INTO webhook_logs (event_type, source_type, source_id, user_id, customer_name, message_id, outcome, detail, transaction_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          eventType,
          sourceType,
          sourceId,
          userId,
          customerName,
          messageId,
          outcome,
          detail,
          transactionId ?? null,
          now
        );
      return Number(res.lastInsertRowid);
    },

    listWebhookLogs(limit = 30) {
      return db
        .prepare('SELECT * FROM webhook_logs ORDER BY id DESC LIMIT ?')
        .all(Number(limit))
        .map((r) => ({
          id: r.id,
          eventType: r.event_type,
          sourceType: r.source_type,
          sourceId: r.source_id,
          userId: r.user_id,
          customerName: r.customer_name,
          messageId: r.message_id,
          outcome: r.outcome,
          detail: r.detail,
          transactionId: r.transaction_id,
          createdAt: r.created_at,
        }));
    },
  };
}
