import { getBangkokDateKey, getBangkokIsoNow } from '../server/services/bankMap.js';
import { randomHex } from './crypto.js';

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
    id: Number(row.id),
    shopId: Number(row.shop_id || 1),
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

const DEFAULT_CATEGORIES = [
  ['ขายสินค้า', '#0D6B4E', 1],
  ['มัดจำออเดอร์', '#0284C7', 0],
  ['ค่าจัดส่ง', '#7C3AED', 0],
  ['โอนชำระหน้าร้าน', '#D97706', 0],
  ['รายรับอื่นๆ', '#475569', 0],
];

export function createD1Repository(d1, env = {}) {
  const defaultSlipApiUrl = (env.SLIP_API_BASE_URL || 'https://my-slip-reader.onrender.com').replace(/\/+$/, '');

  async function ensureShopSeeded(shopId, shopName = 'ร้านค้าของฉัน') {
    const sid = Number(shopId);
    const now = getBangkokIsoNow();
    const defaults = [
      ['shop_name', shopName],
      ['slip_api_base_url', defaultSlipApiUrl],
      ['line_channel_secret', ''],
      ['line_channel_access_token', ''],
      ['line_admin_notify_target_id', ''],
      ['line_auto_reply_enabled', 'true'],
      ['line_reply_on_error', 'true'],
      ['line_ignore_non_slip', 'true'],
      ['line_notify_admin_on_verified', 'false'],
      ['line_notify_admin_on_alert', 'true'],
      ['line_reply_greeting', 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ'],
      ['fb_app_secret', ''],
      ['fb_page_access_token', ''],
      ['fb_verify_token', `fbv_${randomHex(12)}`],
      ['fb_auto_reply_enabled', 'true'],
      ['fb_reply_on_error', 'true'],
      ['fb_ignore_non_slip', 'true'],
      ['fb_reply_greeting', 'ได้รับยอดโอนเรียบร้อยแล้ว ขอบคุณที่อุดหนุนครับ'],
      ['fb_notify_line_admin', 'false'],
      ['check_receiver_account', 'true'],
      ['reject_duplicate_slip', 'true'],
      ['min_amount', '0'],
      ['extension_api_key', `sf_${randomHex(18)}`],
    ];

    const stmts = [
      ...defaults.map(([key, val]) =>
        d1
          .prepare('INSERT OR IGNORE INTO shop_settings (shop_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
          .bind(sid, key, String(val), now)
      ),
      ...DEFAULT_CATEGORIES.map(([name, color, isDefault]) =>
        d1
          .prepare('INSERT OR IGNORE INTO categories (shop_id, name, color, is_default) VALUES (?, ?, ?, ?)')
          .bind(sid, name, color, isDefault)
      ),
    ];
    await d1.batch(stmts);
  }

  return {
    // ===== AUTH & SHOPS =====
    async findUserByUsername(username) {
      const clean = String(username || '').trim().toLowerCase();
      if (!clean) return null;
      return d1.prepare('SELECT * FROM users WHERE username = ?').bind(clean).first();
    },

    async getUserById(id) {
      const row = await d1
        .prepare('SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?')
        .bind(Number(id))
        .first();
      if (!row) return null;
      return {
        id: Number(row.id),
        username: row.username,
        displayName: row.display_name,
        role: row.role || 'SELLER',
        isActive: row.is_active !== 0,
        createdAt: row.created_at,
      };
    },

    async countAdmins() {
      const row = await d1
        .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1`)
        .first();
      return Number(row?.count || 0);
    },

    async createUserWithShop({ username, displayName, passwordHash, passwordSalt, shopName, role }) {
      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanDisplay = String(displayName || cleanUser).trim();
      const cleanShop = String(shopName || `ร้านของ ${cleanDisplay}`).trim();
      const now = getBangkokIsoNow();

      // First user on the platform automatically becomes ADMIN if no admin exists yet
      let assignedRole = role === 'ADMIN' ? 'ADMIN' : 'SELLER';
      if (!role) {
        const adminCount = await this.countAdmins();
        if (adminCount === 0) {
          assignedRole = 'ADMIN';
        }
      }

      const userRes = await d1
        .prepare(
          'INSERT INTO users (username, display_name, password_hash, password_salt, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
        )
        .bind(cleanUser, cleanDisplay, passwordHash, passwordSalt, assignedRole, now)
        .run();
      const userId = Number(userRes.meta?.last_row_id);

      const shop = await this.createShop({ ownerUserId: userId, name: cleanShop });
      const user = await this.getUserById(userId);
      return { user, shop };
    },

    async createShop({ ownerUserId, name }) {
      const cleanName = String(name || 'ร้านค้าใหม่').trim();
      const slug = `sh_${randomHex(8)}`;
      const now = getBangkokIsoNow();
      const res = await d1
        .prepare(
          'INSERT INTO shops (owner_user_id, name, webhook_slug, is_active, created_at) VALUES (?, ?, ?, 1, ?)'
        )
        .bind(Number(ownerUserId), cleanName, slug, now)
        .run();
      const shopId = Number(res.meta?.last_row_id);
      await ensureShopSeeded(shopId, cleanName);
      return this.getShopById(shopId);
    },

    async getShopById(shopId) {
      const row = await d1
        .prepare(
          `SELECT s.*, u.username AS owner_username, u.display_name AS owner_display_name
           FROM shops s
           LEFT JOIN users u ON u.id = s.owner_user_id
           WHERE s.id = ?`
        )
        .bind(Number(shopId))
        .first();
      if (!row) return null;
      return {
        id: Number(row.id),
        ownerUserId: Number(row.owner_user_id),
        ownerUsername: row.owner_username || '',
        ownerDisplayName: row.owner_display_name || '',
        name: row.name,
        webhookSlug: row.webhook_slug,
        isActive: row.is_active !== 0,
        createdAt: row.created_at,
      };
    },

    async getShopByWebhookSlug(slug) {
      if (!slug) return null;
      const row = await d1
        .prepare('SELECT id FROM shops WHERE webhook_slug = ?')
        .bind(String(slug).trim())
        .first();
      if (!row) return null;
      return this.getShopById(Number(row.id));
    },

    async findShopByExtensionApiKey(apiKey) {
      if (!apiKey) return null;
      const row = await d1
        .prepare(`SELECT shop_id FROM shop_settings WHERE key = 'extension_api_key' AND value = ? LIMIT 1`)
        .bind(String(apiKey).trim())
        .first();
      if (!row) return null;
      return this.getShopById(Number(row.shop_id));
    },

    async listShopsForUser(userId, isAdmin = false) {
      const query = isAdmin
        ? `SELECT s.*, u.username AS owner_username, u.display_name AS owner_display_name
           FROM shops s
           LEFT JOIN users u ON u.id = s.owner_user_id
           ORDER BY s.id ASC`
        : `SELECT s.*, u.username AS owner_username, u.display_name AS owner_display_name
           FROM shops s
           LEFT JOIN users u ON u.id = s.owner_user_id
           WHERE s.owner_user_id = ?
           ORDER BY s.id ASC`;
      const stmt = isAdmin ? d1.prepare(query) : d1.prepare(query).bind(Number(userId));
      const { results } = await stmt.all();
      return (results || []).map((row) => ({
        id: Number(row.id),
        ownerUserId: Number(row.owner_user_id),
        ownerUsername: row.owner_username || '',
        ownerDisplayName: row.owner_display_name || '',
        name: row.name,
        webhookSlug: row.webhook_slug,
        isActive: row.is_active !== 0,
        createdAt: row.created_at,
      }));
    },

    async createSession(userId) {
      const token = `sfs_${randomHex(24)}`;
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 86400000);
      await d1
        .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(token, Number(userId), now.toISOString(), expires.toISOString())
        .run();
      return token;
    },

    async getSessionUser(token) {
      if (!token) return null;
      const row = await d1
        .prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?')
        .bind(String(token).trim())
        .first();
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await d1.prepare('DELETE FROM sessions WHERE token = ?').bind(row.token).run();
        return null;
      }
      const user = await this.getUserById(Number(row.user_id));
      if (!user || !user.isActive) return null;
      return user;
    },

    async deleteSession(token) {
      if (!token) return;
      await d1.prepare('DELETE FROM sessions WHERE token = ?').bind(String(token).trim()).run();
    },

    // ===== PLATFORM ADMIN METHODS =====
    async getAdminPlatformOverview() {
      const todayKey = getBangkokDateKey(new Date());
      const monthPrefix = todayKey.slice(0, 7);

      const [
        usersRes,
        shopsRes,
        txAggRes,
        todayAggRow,
        monthAggRow,
        allTimeAggRow,
        settingsRes,
        accountsCountRes,
      ] = await Promise.all([
        d1
          .prepare(
            `SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at,
                    COUNT(s.id) AS shop_count
             FROM users u
             LEFT JOIN shops s ON s.owner_user_id = u.id
             GROUP BY u.id
             ORDER BY u.id ASC`
          )
          .all(),
        d1
          .prepare(
            `SELECT s.*, u.username AS owner_username, u.display_name AS owner_display_name, u.is_active AS owner_is_active
             FROM shops s
             LEFT JOIN users u ON u.id = s.owner_user_id
             ORDER BY s.id ASC`
          )
          .all(),
        d1
          .prepare(
            `SELECT
               shop_id,
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' AND recorded_date = ? THEN amount ELSE 0 END), 0) AS today_revenue,
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' AND recorded_date LIKE ? THEN amount ELSE 0 END), 0) AS month_revenue,
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS all_time_revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count,
               COUNT(*) AS total_count,
               MAX(recorded_at) AS last_activity_at
             FROM transactions
             GROUP BY shop_id`
          )
          .bind(todayKey, `${monthPrefix}%`)
          .all(),
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count
             FROM transactions WHERE recorded_date = ?`
          )
          .bind(todayKey)
          .first(),
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count
             FROM transactions WHERE recorded_date LIKE ?`
          )
          .bind(`${monthPrefix}%`)
          .first(),
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(*) AS total_count
             FROM transactions`
          )
          .first(),
        d1
          .prepare(
            `SELECT shop_id, key, value FROM shop_settings
             WHERE key IN ('line_channel_secret', 'line_channel_access_token', 'fb_app_secret', 'fb_page_access_token')`
          )
          .all(),
        d1
          .prepare(
            `SELECT shop_id, COUNT(*) AS cnt FROM seller_accounts WHERE is_active = 1 GROUP BY shop_id`
          )
          .all(),
      ]);

      const txByShop = new Map((txAggRes.results || []).map((r) => [Number(r.shop_id), r]));
      const accByShop = new Map((accountsCountRes.results || []).map((r) => [Number(r.shop_id), Number(r.cnt || 0)]));
      const cfgByShop = new Map();
      for (const r of settingsRes.results || []) {
        const sid = Number(r.shop_id);
        if (!cfgByShop.has(sid)) cfgByShop.set(sid, {});
        cfgByShop.get(sid)[r.key] = r.value;
      }

      const users = (usersRes.results || []).map((u) => ({
        id: Number(u.id),
        username: u.username,
        displayName: u.display_name,
        role: u.role || 'SELLER',
        isActive: u.is_active !== 0,
        shopCount: Number(u.shop_count || 0),
        createdAt: u.created_at,
      }));

      const shops = (shopsRes.results || []).map((s) => {
        const sid = Number(s.id);
        const agg = txByShop.get(sid);
        const cfg = cfgByShop.get(sid) || {};
        return {
          id: sid,
          name: s.name,
          webhookSlug: s.webhook_slug,
          isActive: s.is_active !== 0,
          createdAt: s.created_at,
          ownerUserId: Number(s.owner_user_id),
          ownerUsername: s.owner_username || '-',
          ownerDisplayName: s.owner_display_name || '-',
          ownerIsActive: s.owner_is_active !== 0,
          todayRevenue: Number(agg?.today_revenue || 0),
          monthRevenue: Number(agg?.month_revenue || 0),
          allTimeRevenue: Number(agg?.all_time_revenue || 0),
          verifiedCount: Number(agg?.verified_count || 0),
          alertCount: Number(agg?.alert_count || 0),
          totalCount: Number(agg?.total_count || 0),
          lastActivityAt: agg?.last_activity_at || '',
          hasLineConfigured: Boolean(cfg.line_channel_secret && cfg.line_channel_access_token),
          hasFbConfigured: Boolean(cfg.fb_app_secret && cfg.fb_page_access_token),
          bankAccountCount: accByShop.get(sid) || 0,
        };
      });

      return {
        kpis: {
          totalShops: shops.length,
          activeShops: shops.filter((s) => s.isActive).length,
          totalUsers: users.length,
          adminUsers: users.filter((u) => u.role === 'ADMIN').length,
          todayRevenue: Number(todayAggRow?.revenue || 0),
          todayVerifiedCount: Number(todayAggRow?.verified_count || 0),
          todayAlertCount: Number(todayAggRow?.alert_count || 0),
          monthRevenue: Number(monthAggRow?.revenue || 0),
          monthVerifiedCount: Number(monthAggRow?.verified_count || 0),
          allTimeRevenue: Number(allTimeAggRow?.revenue || 0),
          allTimeVerifiedCount: Number(allTimeAggRow?.verified_count || 0),
          allTimeTotalCount: Number(allTimeAggRow?.total_count || 0),
        },
        shops,
        users,
      };
    },

    async updateUserAdmin(userId, patch) {
      const uid = Number(userId);
      const existing = await d1.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
      if (!existing) return null;

      const nextDisplay =
        patch.displayName !== undefined ? String(patch.displayName).trim() : existing.display_name;
      const nextRole =
        patch.role !== undefined ? (patch.role === 'ADMIN' ? 'ADMIN' : 'SELLER') : existing.role || 'SELLER';
      const nextActive =
        patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.is_active ?? 1;
      const nextHash = patch.passwordHash || existing.password_hash;
      const nextSalt = patch.passwordSalt || existing.password_salt;

      await d1
        .prepare(
          `UPDATE users
           SET display_name = ?, role = ?, is_active = ?, password_hash = ?, password_salt = ?
           WHERE id = ?`
        )
        .bind(nextDisplay, nextRole, nextActive, nextHash, nextSalt, uid)
        .run();

      if (nextActive === 0) {
        await d1.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
      }
      return this.getUserById(uid);
    },

    async deleteUserAdmin(userId) {
      const uid = Number(userId);
      const userShops = await this.listShopsForUser(uid, false);
      for (const s of userShops) {
        await this.deleteShopAdmin(s.id);
      }
      await d1.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
      const res = await d1.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
      return Number(res.meta?.changes || 0) > 0;
    },

    async updateShopAdmin(shopId, patch) {
      const sid = Number(shopId);
      const existing = await d1.prepare('SELECT * FROM shops WHERE id = ?').bind(sid).first();
      if (!existing) return null;

      const nextName = patch.name !== undefined ? String(patch.name).trim() : existing.name;
      const nextActive =
        patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.is_active ?? 1;

      await d1
        .prepare('UPDATE shops SET name = ?, is_active = ? WHERE id = ?')
        .bind(nextName, nextActive, sid)
        .run();

      if (patch.name !== undefined) {
        await this.updateSettings(sid, { shopName: nextName });
      }
      return this.getShopById(sid);
    },

    async deleteShopAdmin(shopId) {
      const sid = Number(shopId);
      await d1.batch([
        d1.prepare('DELETE FROM transactions WHERE shop_id = ?').bind(sid),
        d1.prepare('DELETE FROM seller_accounts WHERE shop_id = ?').bind(sid),
        d1.prepare('DELETE FROM categories WHERE shop_id = ?').bind(sid),
        d1.prepare('DELETE FROM webhook_logs WHERE shop_id = ?').bind(sid),
        d1.prepare('DELETE FROM shop_settings WHERE shop_id = ?').bind(sid),
        d1.prepare('DELETE FROM shops WHERE id = ?').bind(sid),
      ]);
      return true;
    },

    // ===== PER-SHOP SETTINGS =====
    async getSettings(shopId) {
      const sid = Number(shopId);
      const shop = await this.getShopById(sid);
      await ensureShopSeeded(sid, shop?.name || 'ร้านค้าของฉัน');

      const { results } = await d1
        .prepare('SELECT key, value FROM shop_settings WHERE shop_id = ?')
        .bind(sid)
        .all();
      const map = {};
      for (const r of results || []) {
        map[r.key] = r.value;
      }
      return {
        shopId: sid,
        webhookSlug: shop?.webhookSlug || '',
        shopName: map.shop_name || shop?.name || 'ร้านค้าของฉัน',
        slipApiBaseUrl: (map.slip_api_base_url || defaultSlipApiUrl).replace(/\/+$/, ''),
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

    async getPublicSettings(shopId) {
      const s = await this.getSettings(shopId);
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

    async updateSettings(shopId, patch) {
      const sid = Number(shopId);
      await ensureShopSeeded(sid);
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
      const stmts = [];
      for (const [camel, dbKey] of Object.entries(keyMap)) {
        if (patch[camel] === undefined) continue;
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
          val = String(val || defaultSlipApiUrl).trim().replace(/\/+$/, '');
        } else if (typeof val === 'boolean') {
          val = val ? 'true' : 'false';
        } else {
          val = String(val);
        }
        stmts.push(
          d1
            .prepare(
              'INSERT INTO shop_settings (shop_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(shop_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
            )
            .bind(sid, dbKey, val, now)
        );
      }
      if (patch.shopName && String(patch.shopName).trim()) {
        stmts.push(
          d1.prepare('UPDATE shops SET name = ? WHERE id = ?').bind(String(patch.shopName).trim(), sid)
        );
      }
      if (stmts.length > 0) {
        await d1.batch(stmts);
      }
      return this.getPublicSettings(sid);
    },

    async regenerateExtensionApiKey(shopId) {
      const nextKey = `sf_${randomHex(18)}`;
      await this.updateSettings(shopId, { extensionApiKey: nextKey });
      return nextKey;
    },

    async regenerateFbVerifyToken(shopId) {
      const nextToken = `fbv_${randomHex(12)}`;
      await this.updateSettings(shopId, { fbVerifyToken: nextToken });
      return nextToken;
    },

    // ===== SELLER ACCOUNTS (SCOPED BY SHOP_ID) =====
    async listSellerAccounts(shopId) {
      const { results } = await d1
        .prepare('SELECT * FROM seller_accounts WHERE shop_id = ? ORDER BY is_active DESC, id DESC')
        .bind(Number(shopId))
        .all();
      return (results || []).map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shop_id),
        bankCode: r.bank_code,
        bankName: r.bank_name,
        accountNumber: r.account_number,
        accountName: r.account_name,
        accountType: r.account_type,
        isActive: Boolean(r.is_active),
        createdAt: r.created_at,
      }));
    },

    async createSellerAccount(shopId, { bankCode, bankName, accountNumber, accountName, accountType = 'BANK' }) {
      const now = getBangkokIsoNow();
      const res = await d1
        .prepare(
          `INSERT INTO seller_accounts (shop_id, bank_code, bank_name, account_number, account_name, account_type, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind(
          Number(shopId),
          String(bankCode || '004').trim(),
          String(bankName || '').trim(),
          String(accountNumber || '').trim(),
          String(accountName || '').trim(),
          accountType === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK',
          now
        )
        .run();
      const accounts = await this.listSellerAccounts(shopId);
      return accounts.find((a) => a.id === Number(res.meta?.last_row_id));
    },

    async updateSellerAccount(shopId, id, patch) {
      const existing = await d1
        .prepare('SELECT * FROM seller_accounts WHERE id = ? AND shop_id = ?')
        .bind(Number(id), Number(shopId))
        .first();
      if (!existing) return null;
      await d1
        .prepare(
          `UPDATE seller_accounts
           SET bank_code = ?, bank_name = ?, account_number = ?, account_name = ?, account_type = ?, is_active = ?
           WHERE id = ? AND shop_id = ?`
        )
        .bind(
          patch.bankCode !== undefined ? String(patch.bankCode).trim() : existing.bank_code,
          patch.bankName !== undefined ? String(patch.bankName).trim() : existing.bank_name,
          patch.accountNumber !== undefined ? String(patch.accountNumber).trim() : existing.account_number,
          patch.accountName !== undefined ? String(patch.accountName).trim() : existing.account_name,
          patch.accountType !== undefined
            ? patch.accountType === 'PROMPTPAY'
              ? 'PROMPTPAY'
              : 'BANK'
            : existing.account_type,
          patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.is_active,
          Number(id),
          Number(shopId)
        )
        .run();
      const accounts = await this.listSellerAccounts(shopId);
      return accounts.find((a) => a.id === Number(id));
    },

    async deleteSellerAccount(shopId, id) {
      const res = await d1
        .prepare('DELETE FROM seller_accounts WHERE id = ? AND shop_id = ?')
        .bind(Number(id), Number(shopId))
        .run();
      return Number(res.meta?.changes || 0) > 0;
    },

    // ===== CATEGORIES (SCOPED BY SHOP_ID) =====
    async listCategories(shopId) {
      await ensureShopSeeded(shopId);
      const { results } = await d1
        .prepare('SELECT * FROM categories WHERE shop_id = ? ORDER BY is_default DESC, id ASC')
        .bind(Number(shopId))
        .all();
      return (results || []).map((c) => ({
        id: Number(c.id),
        name: c.name,
        color: c.color,
        isDefault: Boolean(c.is_default),
      }));
    },

    async createCategory(shopId, { name, color = '#0D6B4E' }) {
      const cleanName = String(name || '').trim();
      const res = await d1
        .prepare('INSERT INTO categories (shop_id, name, color, is_default) VALUES (?, ?, ?, 0)')
        .bind(Number(shopId), cleanName, String(color || '#0D6B4E').trim())
        .run();
      return { id: Number(res.meta?.last_row_id), name: cleanName, color, isDefault: false };
    },

    async deleteCategory(shopId, id) {
      const res = await d1
        .prepare('DELETE FROM categories WHERE id = ? AND shop_id = ? AND is_default = 0')
        .bind(Number(id), Number(shopId))
        .run();
      return Number(res.meta?.changes || 0) > 0;
    },

    // ===== TRANSACTIONS (SCOPED BY SHOP_ID) =====
    async findVerifiedByTransRef(shopId, transRef) {
      if (!transRef) return null;
      const row = await d1
        .prepare(
          `SELECT * FROM transactions WHERE shop_id = ? AND trans_ref = ? AND status = 'VERIFIED' ORDER BY id ASC LIMIT 1`
        )
        .bind(Number(shopId), String(transRef).trim())
        .first();
      return mapTransaction(row);
    },

    async createTransaction(shopId, tx) {
      const sid = Number(shopId);
      const now = tx.recordedAt || getBangkokIsoNow();
      const dateKey = tx.recordedDate || getBangkokDateKey(now);
      const res = await d1
        .prepare(
          `INSERT INTO transactions (
            shop_id, trans_ref, status, channel, amount, sending_bank_code, sending_bank_name,
            sender_account, receiver_account, matched_seller_account_id, matched_seller_account_label,
            transfer_display, transfer_iso, recorded_at, recorded_date,
            customer_name, customer_line_id, line_source_type, line_source_id, line_message_id,
            category, order_note, verification_message, error_code, crc_hex, processing_ms,
            raw_qr_payload, tlv_breakdown_json, ocr_lines_json, checks_json, raw_api_response_json
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )`
        )
        .bind(
          sid,
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
        )
        .run();
      return this.getTransactionById(sid, Number(res.meta?.last_row_id));
    },

    async getTransactionById(shopId, id) {
      const row = await d1
        .prepare('SELECT * FROM transactions WHERE id = ? AND shop_id = ?')
        .bind(Number(id), Number(shopId))
        .first();
      return mapTransaction(row);
    },

    async updateTransaction(shopId, id, patch) {
      const existing = await d1
        .prepare('SELECT * FROM transactions WHERE id = ? AND shop_id = ?')
        .bind(Number(id), Number(shopId))
        .first();
      if (!existing) return null;
      await d1
        .prepare(
          `UPDATE transactions
           SET status = ?, amount = ?, category = ?, order_note = ?, customer_name = ?, verification_message = ?
           WHERE id = ? AND shop_id = ?`
        )
        .bind(
          patch.status !== undefined ? String(patch.status) : existing.status,
          patch.amount !== undefined ? Number(patch.amount) : existing.amount,
          patch.category !== undefined ? String(patch.category) : existing.category,
          patch.orderNote !== undefined ? String(patch.orderNote) : existing.order_note,
          patch.customerName !== undefined ? String(patch.customerName) : existing.customer_name,
          patch.verificationMessage !== undefined ? String(patch.verificationMessage) : existing.verification_message,
          Number(id),
          Number(shopId)
        )
        .run();
      return this.getTransactionById(shopId, Number(id));
    },

    async deleteTransaction(shopId, id) {
      const res = await d1
        .prepare('DELETE FROM transactions WHERE id = ? AND shop_id = ?')
        .bind(Number(id), Number(shopId))
        .run();
      return Number(res.meta?.changes || 0) > 0;
    },

    async listTransactions(
      shopId,
      { status, channel, category, search, dateFrom, dateTo, limit = 100, offset = 0 } = {}
    ) {
      const where = ['shop_id = ?'];
      const params = [Number(shopId)];

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

      const whereSql = `WHERE ${where.join(' AND ')}`;
      const totalRow = await d1
        .prepare(`SELECT COUNT(*) AS count FROM transactions ${whereSql}`)
        .bind(...params)
        .first();
      const { results } = await d1
        .prepare(`SELECT * FROM transactions ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .bind(...params, Number(limit), Number(offset))
        .all();

      return {
        total: Number(totalRow?.count || 0),
        items: (results || []).map(mapTransaction),
      };
    },

    async getDashboardSummary(shopId, days = 7) {
      const sid = Number(shopId);
      const todayKey = getBangkokDateKey(new Date());
      const monthPrefix = todayKey.slice(0, 7);

      const dayKeys = [];
      const nowMs = Date.now();
      for (let i = days - 1; i >= 0; i--) {
        dayKeys.push(getBangkokDateKey(new Date(nowMs - i * 86400000)));
      }
      const startDate = dayKeys[0];

      const [todayStats, monthStats, allTimeStats, dailyRes, bankRes, channelRes, catRes] = await Promise.all([
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count,
               COUNT(*) AS total_count
             FROM transactions WHERE shop_id = ? AND recorded_date = ?`
          )
          .bind(sid, todayKey)
          .first(),
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count
             FROM transactions WHERE shop_id = ? AND recorded_date LIKE ?`
          )
          .bind(sid, `${monthPrefix}%`)
          .first(),
        d1
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status = 'DUPLICATE' THEN 1 END) AS duplicate_count,
               COUNT(CASE WHEN status = 'WRONG_ACCOUNT' THEN 1 END) AS wrong_account_count,
               COUNT(CASE WHEN status = 'NEEDS_REVIEW' THEN 1 END) AS review_count,
               COUNT(*) AS total_count
             FROM transactions WHERE shop_id = ?`
          )
          .bind(sid)
          .first(),
        d1
          .prepare(
            `SELECT
               recorded_date AS date,
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(CASE WHEN status IN ('DUPLICATE', 'WRONG_ACCOUNT', 'NEEDS_REVIEW', 'INVALID') THEN 1 END) AS alert_count
             FROM transactions
             WHERE shop_id = ? AND recorded_date >= ?
             GROUP BY recorded_date`
          )
          .bind(sid, startDate)
          .all(),
        d1
          .prepare(
            `SELECT
               COALESCE(NULLIF(sending_bank_name, ''), 'ไม่ระบุธนาคาร') AS label,
               COALESCE(SUM(amount), 0) AS revenue,
               COUNT(*) AS count
             FROM transactions
             WHERE shop_id = ? AND status = 'VERIFIED'
             GROUP BY label
             ORDER BY revenue DESC
             LIMIT 6`
          )
          .bind(sid)
          .all(),
        d1
          .prepare(
            `SELECT
               channel,
               COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount ELSE 0 END), 0) AS revenue,
               COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) AS verified_count,
               COUNT(*) AS total_count
             FROM transactions
             WHERE shop_id = ?
             GROUP BY channel
             ORDER BY total_count DESC`
          )
          .bind(sid)
          .all(),
        d1
          .prepare(
            `SELECT
               category AS label,
               COALESCE(SUM(amount), 0) AS revenue,
               COUNT(*) AS count
             FROM transactions
             WHERE shop_id = ? AND status = 'VERIFIED'
             GROUP BY category
             ORDER BY revenue DESC`
          )
          .bind(sid)
          .all(),
      ]);

      const dailyMap = new Map((dailyRes.results || []).map((r) => [r.date, r]));
      const dailySeries = dayKeys.map((date) => {
        const hit = dailyMap.get(date);
        return {
          date,
          revenue: Number(hit?.revenue || 0),
          verifiedCount: Number(hit?.verified_count || 0),
          alertCount: Number(hit?.alert_count || 0),
        };
      });

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
        byBank: (bankRes.results || []).map((r) => ({
          label: r.label,
          revenue: Number(r.revenue || 0),
          count: Number(r.count || 0),
        })),
        byChannel: (channelRes.results || []).map((r) => ({
          channel: r.channel,
          revenue: Number(r.revenue || 0),
          verifiedCount: Number(r.verified_count || 0),
          totalCount: Number(r.total_count || 0),
        })),
        byCategory: (catRes.results || []).map((r) => ({
          label: r.label,
          revenue: Number(r.revenue || 0),
          count: Number(r.count || 0),
        })),
      };
    },

    // ===== WEBHOOK LOGS (SCOPED BY SHOP_ID) =====
    async logWebhookEvent(
      shopId,
      {
        eventType,
        sourceType = '',
        sourceId = '',
        userId = '',
        customerName = '',
        messageId = '',
        outcome,
        detail = '',
        transactionId = null,
      }
    ) {
      const now = getBangkokIsoNow();
      const res = await d1
        .prepare(
          `INSERT INTO webhook_logs (shop_id, event_type, source_type, source_id, user_id, customer_name, message_id, outcome, detail, transaction_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          Number(shopId),
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
        )
        .run();
      return Number(res.meta?.last_row_id || 0);
    },

    async listWebhookLogs(shopId, limit = 30) {
      const { results } = await d1
        .prepare('SELECT * FROM webhook_logs WHERE shop_id = ? ORDER BY id DESC LIMIT ?')
        .bind(Number(shopId), Number(limit))
        .all();
      return (results || []).map((r) => ({
        id: Number(r.id),
        eventType: r.event_type,
        sourceType: r.source_type,
        sourceId: r.source_id,
        userId: r.user_id,
        customerName: r.customer_name,
        messageId: r.message_id,
        outcome: r.outcome,
        detail: r.detail,
        transactionId: r.transaction_id ? Number(r.transaction_id) : null,
        createdAt: r.created_at,
      }));
    },
  };
}
